import { StatusCodes } from "http-status-codes";
import Service from "../models/Service.js";
import User from "../models/User.js";
import Provider from "../models/Provider.js";
import Booking from "../models/Booking.js";
import Feedback from "../models/Feedback.js";

/* ------------------------------------------------------------------
   GET GLOBAL PLATFORM STATS (PUBLIC)
   Endpoint: GET /services/stats
-------------------------------------------------------------------*/
export const getGlobalStats = async (req, res) => {
  try {
    const [providerCount, allBookings, providerRatings, userCount] = await Promise.all([
      Provider.countDocuments({}),
      Booking.countDocuments({}),
      Provider.aggregate([
        { $match: { isVerified: true, rating: { $gt: 0 } } },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } }
      ]),
      User.countDocuments({ role: "user" })
    ]);

    const dynamicProviders = providerCount || 0;
    const dynamicBookings = allBookings || 0;
    const avgRating = providerRatings.length > 0 ? providerRatings[0].avgRating.toFixed(1) : "4.8";

    return res.status(StatusCodes.OK).json({
      success: true,
      stats: {
        providers: dynamicProviders,
        bookings: dynamicBookings,
        rating: avgRating,
        users: userCount || 0
      }
    });
  } catch (error) {
    console.error("Error fetching global stats:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};
/* ------------------------------------------------------------------
   GET ALL SERVICES (FILTER BY CITY + SEARCH)
   Endpoint: GET /services?city=Patna&query=cook
-------------------------------------------------------------------*/
export const getServices = async (req, res) => {
  try {
    const { city, query, all } = req.query;
    const filter = {};

    // Only show active services unless requested otherwise (e.g. by Admin)
    if (all !== "true") {
      filter.status = "active";
    }

    // Filter services by city (matches single city or any city in cities array),
    // but ALWAYS include Digital Work categories since they are not city-specific.
    if (city) {
      const cityRegex = new RegExp(`^${city.trim()}$`, "i");
      filter.$or = [
        { city: cityRegex },
        { cities: cityRegex },
        { category: { $in: ["Digital Work", "Digital Services", "Web Development", "Biding Services"] } },
        { serviceType: "bidding" }
      ];
    }

    // Search by category, subService, description
    if (query) {
      const searchQuery = { $regex: query, $options: "i" };
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          { 
            $or: [
              { category: searchQuery },
              { subService: searchQuery },
              { description: searchQuery }
            ] 
          }
        ];
        delete filter.$or;
      } else {
        filter.$or = [
          { category: searchQuery },
          { subService: searchQuery },
          { description: searchQuery }
        ];
      }
    }

    const isAll = req.query.all === "true";
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || (isAll ? 1000 : 50); 
    const skip = (page - 1) * limit;

    let serviceQuery = Service.find(filter)
      .select("category providerSubService subService description imageUrl price basePrice discount city cities status requirement jobId serviceType")
      .sort({ createdAt: -1 });

    if (!isAll) {
      serviceQuery = serviceQuery.skip(skip).limit(limit);
    }

    let services = await serviceQuery;

    // CHECK FOR FAVORITES (If user logged in)
    let favoriteIds = [];
    if (req.user && req.user.role === "user") {
      const user = await User.findById(req.user.sub).select("favoriteServices");
      favoriteIds = user?.favoriteServices?.map(id => id.toString()) || [];
    }

    // Map services to include isFavorite property and normalize basePrice
    const servicesWithFav = services.map(service => {
      const s = service.toObject();
      s.isFavorite = favoriteIds.includes(s._id.toString());
      s.discount = Number(s.discount || 0);
      s.price = Number(s.price || 0);
      s.basePrice = Number(s.basePrice || 0);
      if (s.basePrice <= 0) {
        if (s.discount > 0 && s.price > 0) {
          s.basePrice = Math.round(s.price / (1 - s.discount / 100));
        } else {
          s.basePrice = s.price;
        }
      }
      return s;
    });

    const total = await Service.countDocuments(filter);

    return res.status(StatusCodes.OK).json({
      success: true,
      services: servicesWithFav,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching services:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   GET A SINGLE SERVICE BY ID
   Endpoint: GET /services/:id
-------------------------------------------------------------------*/
export const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Service not found" });
    }

    const result = service.toObject();
    result.discount = Number(result.discount || 0);
    result.price = Number(result.price || 0);
    result.basePrice = Number(result.basePrice || 0);
    if (result.basePrice <= 0) {
      if (result.discount > 0 && result.price > 0) {
        result.basePrice = Math.round(result.price / (1 - result.discount / 100));
      } else {
        result.basePrice = result.price;
      }
    }
    
    // ✅ CHECK FOR FAVORITES (If user logged in)
    let isFavorite = false;
    if (req.user && req.user.role === "user") {
        const user = await User.findById(req.user.sub).select("favoriteServices");
        const favoriteIds = user?.favoriteServices?.map(id => id.toString()) || [];
        isFavorite = favoriteIds.includes(result._id.toString());
    }

    result.isFavorite = isFavorite;

    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("Error fetching service:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal Server Error" });
  }
};

import { uploadToStorage } from "../libs/storage.js";

/* ------------------------------------------------------------------
   ADD NEW SERVICE
   Endpoint: POST /services
-------------------------------------------------------------------*/
export const addService = async (req, res) => {
  try {
    let {
      category,
      providerSubService,
      subService,
      description,
      requirement,
      imageUrl,
      price,
      basePrice,
      discount,
      city,
      cities,
      serviceType
    } = req.body;

    // Handle uploaded file
    if (req.file) {
      imageUrl = await uploadToStorage(req.file, "services");
    }

    // Handle cities array from JSON string if needed
    if (typeof cities === "string") {
      try { cities = JSON.parse(cities); } catch (e) { cities = [cities]; }
    }

    let numDiscount = serviceType === "bidding" ? 0 : Number(discount ?? 0);
    let numPrice = serviceType === "bidding" ? 0 : Number(price ?? 0);
    let numBasePrice = serviceType === "bidding" ? 0 : Number(basePrice || 0);

    if (serviceType !== "bidding") {
      if (numDiscount > 0) {
        if (numBasePrice > 0) {
          numPrice = Math.round(numBasePrice - (numBasePrice * numDiscount / 100));
        } else if (numPrice > 0) {
          numBasePrice = Math.round(numPrice / (1 - numDiscount / 100));
        }
      } else {
        if (numBasePrice <= 0) numBasePrice = numPrice;
        if (numPrice <= 0) numPrice = numBasePrice;
      }
    }

    const newService = new Service({
      category,
      providerSubService: providerSubService || "",
      subService,
      description,
      requirement,
      imageUrl,
      basePrice: numBasePrice,
      discount: numDiscount,
      price: numPrice,
      city: city || (cities && cities[0]) || "",
      cities: cities || [],
      status: "active",
      serviceType: serviceType || "normal",
    });

    await newService.save();

    // Real-time notification
    try {
      const { getIO, broadcastStats } = await import("../libs/socket.js");
      getIO().emit("jobAdded", { serviceId: newService._id, category: newService.category });
      broadcastStats();
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res
      .status(StatusCodes.CREATED)
      .json({ message: "Service created successfully", service: newService });
  } catch (error) {
    console.error("Error adding service:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ 
        error: "Internal Server Error", 
        message: error.message,
        details: error.errors // Include Mongoose validation details if any
      });
  }
};

/* ------------------------------------------------------------------
   PATCH SERVICE STATUS
   Endpoint: PATCH /services/:id/status
-------------------------------------------------------------------*/
export const patchServiceStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const service = await Service.findByIdAndUpdate(req.params.id, { status }, { new: true });

    if (!service) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Service not found" });
    }

    // Real-time notification
    try {
      const { getIO, broadcastStats } = await import("../libs/socket.js");
      getIO().emit("jobUpdated", { serviceId: service._id, status: service.status });
      broadcastStats();
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res.status(StatusCodes.OK).json({ message: "Status updated", service });
  } catch (error) {
    console.error("Error patching status:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   ADD CITY TO SERVICE
   Endpoint: PATCH /services/:id/add-city
-------------------------------------------------------------------*/
export const addCityToService = async (req, res) => {
  try {
    const { city } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $addToSet: { cities: city } },
      { new: true }
    );

    if (!service) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Service not found" });
    }

    // Real-time notification
    try {
      const { getIO } = await import("../libs/socket.js");
      getIO().emit("jobUpdated", { serviceId: service._id });
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res.status(StatusCodes.OK).json(service);
  } catch (error) {
    console.error("Error adding city:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   REMOVE CITY FROM SERVICE
   Endpoint: PATCH /services/:id/remove-city
-------------------------------------------------------------------*/
export const removeCityFromService = async (req, res) => {
  try {
    const { city } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { $pull: { cities: city } },
      { new: true }
    );

    if (!service) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Service not found" });
    }

    // Real-time notification
    try {
      const { getIO } = await import("../libs/socket.js");
      getIO().emit("jobUpdated", { serviceId: service._id });
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res.status(StatusCodes.OK).json(service);
  } catch (error) {
    console.error("Error removing city:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   UPDATE SERVICE
   Endpoint: PUT /services/:id
-------------------------------------------------------------------*/
export const updateService = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (req.file) {
      updateData.imageUrl = await uploadToStorage(req.file, "services");
    }

    // Handle cities array from JSON string if needed (e.g. from FormData)
    if (updateData.cities) {
      if (typeof updateData.cities === "string") {
        try {
          updateData.cities = JSON.parse(updateData.cities);
        } catch (e) {
          updateData.cities = [updateData.cities];
        }
      }
      if (Array.isArray(updateData.cities) && updateData.cities.length > 0) {
        updateData.city = updateData.cities[0];
      }
    }

    if (updateData.basePrice !== undefined || updateData.discount !== undefined || updateData.price !== undefined) {
      let numDiscount = Number(updateData.discount ?? 0);
      let numBasePrice = Number(updateData.basePrice || 0);
      let numPrice = Number(updateData.price || 0);

      if (numDiscount > 0) {
        if (numBasePrice > 0) {
          numPrice = Math.round(numBasePrice - (numBasePrice * numDiscount / 100));
        } else if (numPrice > 0) {
          numBasePrice = Math.round(numPrice / (1 - numDiscount / 100));
        }
      } else {
        if (numBasePrice <= 0) numBasePrice = numPrice;
        if (numPrice <= 0) numPrice = numBasePrice;
      }

      updateData.basePrice = numBasePrice;
      updateData.discount = numDiscount;
      updateData.price = numPrice;
    }

    const service = await Service.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!service) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Service not found" });
    }

    // Real-time notification
    try {
      const { getIO } = await import("../libs/socket.js");
      getIO().emit("jobUpdated", { serviceId: service._id, category: service.category });
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res.status(StatusCodes.OK).json({ message: "Service updated successfully", service });
  } catch (error) {
    console.error("Error updating service:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   DELETE SERVICE
   Endpoint: DELETE /services/:id
-------------------------------------------------------------------*/
export const deleteService = async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);

    if (!service) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Service not found" });
    }

    // Real-time notification
    try {
      const { getIO } = await import("../libs/socket.js");
      getIO().emit("jobDeleted", { serviceId: req.params.id });
    } catch (ioErr) {
      console.error("Socket emit error:", ioErr.message);
    }

    return res
      .status(StatusCodes.OK)
      .json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal Server Error" });
  }
};/* ------------------------------------------------------------------
   GET SERVICE HIERARCHY
   Endpoint: GET /services/hierarchy
-------------------------------------------------------------------*/
let hierarchyCache = null;
let lastHierarchyFetch = 0;
const HIERARCHY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const getHierarchy = async (req, res) => {
  try {
    const now = Date.now();
    if (hierarchyCache && (now - lastHierarchyFetch < HIERARCHY_CACHE_TTL)) {
      return res.status(StatusCodes.OK).json({ success: true, hierarchy: hierarchyCache });
    }

    const services = await Service.find({ status: "active" }).select("category providerSubService subService");
    
    const hierarchy = services.reduce((acc, curr) => {
      let { category, providerSubService, subService } = curr;
      
      // Rebranding/Consolidation logic
      if (category === "Biding Services" || category === "Digital Works" || category === "Digital Work" || category === "Web Development") {
        category = "Digital Services";
      }

      // Specific trade rebranding within Digital Services
      if (category === "Digital Services" && providerSubService === "Web Development") {
        providerSubService = "Digital Work";
      }

      // Normalize spacing around ampersands to prevent duplicates like "AI &CyberSecurity" vs "AI & CyberSecurity"
      if (providerSubService) {
        providerSubService = providerSubService.replace(/\s*&\s*/g, ' & ').trim();
      }

      if (!acc[category]) {
        acc[category] = {};
      }
      if (providerSubService) {
        if (!acc[category][providerSubService]) {
          acc[category][providerSubService] = [];
        }
        if (subService && !acc[category][providerSubService].includes(subService)) {
           acc[category][providerSubService].push(subService);
        }
      }
      return acc;
    }, {});

    // Ensure common categories and their trades are present even if empty
    const defaultHierarchy = {
      "Home Services": {
        "Cleaning": ["House Cleaning", "Deep Cleaning", "Sofa & Carpet Cleaning", "Kitchen Deep Clean"],
        "Plumbing": ["Tap & Shower Repair", "Drainage Unblocking", "Full Home Checkup", "Pipe Leakage"],
        "Electrical": ["Fan Repair/Install", "Switchboard Install", "Light Installation", "Internal Wiring"],
        "AC & Appliance": ["AC Deep Cleaning", "AC Installation", "Washing Machine Repair", "Refrigerator Repair"],
        "Carpentry": ["Furniture Repair", "Lock Installation", "New Furniture Making", "Door/Window Repair"],
        "Painting": ["Full Home Painting", "Texture Wall", "Waterproofing", "Touch-up Painting"]
      },
      "Professional Works": {
        "Legal": ["Contract Drafting", "Legal Consultation", "Property Dispute", "Divorce/Family Law"],
        "Accounting & Tax": ["ITR Filing", "GST Return", "Bookkeeping", "Audit Support"],
        "Architecture": ["Floor Planning", "3D Interior Design", "Site Supervision", "Vastu Consultation"],
        "Digital Marketing": ["SEO Optimization", "Social Media Management", "PPC Campaigns", "Email Marketing"]
      },
      "Digital Services": {
        "Digital Work": ["WordPress Website", "E-commerce Site", "Custom Web App", "Website Maintenace"],
        "Graphic Design": ["Logo Branding", "Social Media Posts", "UI/UX Design", "Print Label Design"],
        "Content Creation": ["Blog Writing", "Technical Writing", "Creative Storytelling", "Copywriting"],
        "Video Editing": ["Youtube Editing", "Event Video", "Reels/TikTok Short Edits", "Corporate Ad"]
      },
      "Emergency service": {
        "Medical Support": ["Emergency Nursing", "Oxygen Support", "Vital Monitoring", "First Aid Provider"],
        "Security": ["Guard Services", "Electronic Surveillance", "Crisis Management", "Personal Protection"],
        "Vehicle Recovery": ["Flat Tire Support", "Towing Service", "Fuel Delivery", "Battery Jumpstart"]
      },
      "Per day Services": {
        "Daily Labor": ["Construction Labor", "Loading/Unloading", "Garden Maintenance", "Cleaning Labor"],
        "Event Support": ["Event Coordinator", "Stage Setup", "Sound Management", "Host/Usher"],
        "Catering Service": ["Server/Waiter", "Dishwashing", "Food Prep Helper", "Buffet Setup"]
      },
      "Medical Helpers": {
        "Patient Care": ["Post-Surgical Care", "Senior Citizen Care", "Infant Baby Care", "Physiotherapy"],
        "Nursing": ["IV Infusion", "Wound Dressing", "Catheter Care", "Injections & Meds"],
        "Phlebotomy": ["Blood Collection", "Home Lab Testing", "Report Consultation", "Vital Checkups"]
      }
    };
    
    // Merge database results into the default hierarchy
    Object.keys(defaultHierarchy).forEach(sector => {
       if (!hierarchy[sector]) {
         hierarchy[sector] = defaultHierarchy[sector];
       } else {
         Object.keys(defaultHierarchy[sector]).forEach(trade => {
            if (!hierarchy[sector][trade]) {
               hierarchy[sector][trade] = defaultHierarchy[sector][trade];
            } else {
               // Merge tasks uniquely
               const combinedTasks = Array.from(new Set([
                 ...hierarchy[sector][trade],
                 ...defaultHierarchy[sector][trade]
               ]));
               hierarchy[sector][trade] = combinedTasks;
            }
         });
       }
    });
    
    hierarchyCache = hierarchy;
    lastHierarchyFetch = now;

    return res.status(StatusCodes.OK).json({ success: true, hierarchy });
  } catch (error) {
    console.error("Error fetching hierarchy:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   GET TOP-RATED PROVIDERS (PUBLIC)
   Endpoint: GET /services/popular-providers
-------------------------------------------------------------------*/
export const getPopularProviders = async (req, res) => {
  try {
    const providers = await Provider.find({ isVerified: true, rating: { $gt: 0 } })
      .sort({ rating: -1 })
      .limit(6)
      .select("fullName rating serviceCategory profilePhoto");

    const formattedProviders = providers.map(p => ({
      name: p.fullName || "Service Expert",
      rating: p.rating || 0,
      category: p.serviceCategory || "Service Expert",
      img: p.profilePhoto || ""
    }));

    return res.status(StatusCodes.OK).json({ success: true, data: formattedProviders });
  } catch (error) {
    console.error("Error fetching popular providers:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   GET PROVIDERS FOR A SPECIFIC SERVICE
   Endpoint: GET /services/:id/providers
-------------------------------------------------------------------*/
export const getProvidersByService = async (req, res) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);

    if (!service) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Service not found" });
    }

    const { category, providerSubService: serviceTrade, subService: serviceTask } = service;

    // Consolidate categories to match hierarchy and provider registrations (e.g. Digital Works vs Digital Services)
    const categoryGroup = [category];
    const digitalCategoryGroup = ["Biding Services", "Digital Works", "Digital Work", "Web Development", "Digital Services"];
    const isDigital = digitalCategoryGroup.some(cat => cat.toLowerCase() === category.toLowerCase());
    
    if (isDigital) {
      categoryGroup.push(...digitalCategoryGroup);
    }
    
    const uniqueCategories = Array.from(new Set(categoryGroup));
    const categoryRegexes = uniqueCategories.map(cat => new RegExp("^" + cat.trim() + "$", "i"));

    // Build trade matching regexes
    const tradeRegexes = [];
    if (serviceTrade) {
      tradeRegexes.push(new RegExp("^" + serviceTrade.trim() + "$", "i"));
      // Handle Web Development vs Digital Work trade alias
      if (serviceTrade.toLowerCase() === "web development") {
        tradeRegexes.push(/^Digital Work$/i);
      } else if (serviceTrade.toLowerCase() === "digital work") {
        tradeRegexes.push(/^Web Development$/i);
      }
    }

    let providers = [];

    // Base query conditions for active, verified providers in the matched categories
    const baseQuery = {
      status: "Active",
      isVerified: true,
      serviceCategory: { $in: categoryRegexes }
    };

    if (!isDigital) {
      if (service.city) {
        baseQuery.city = new RegExp("^" + service.city.trim() + "$", "i");
      } else if (service.cities && service.cities.length > 0) {
        const cityRegexes = service.cities.map(c => new RegExp("^" + c.trim() + "$", "i"));
        baseQuery.city = { $in: cityRegexes };
      }
    }

    // Build conditional $or array for trade match OR specific task match
    const orConditions = [];
    if (tradeRegexes.length > 0) {
      tradeRegexes.forEach(regex => {
        orConditions.push({ providerSubService: regex });
      });
    }
    if (serviceTask) {
      orConditions.push({ subService: serviceTask });
    }

    if (orConditions.length > 0) {
      providers = await Provider.find({
        ...baseQuery,
        $or: orConditions
      }).select("fullName serviceCategory providerSubService experience rating profilePhoto city");
    }



    // Fetch average rating dynamically from feedbacks
    const providerIds = providers.map(p => p._id);
    const feedbackStats = await Feedback.aggregate([
      { $match: { providerId: { $in: providerIds } } },
      { $group: { _id: "$providerId", avgRating: { $avg: "$rating" } } }
    ]);

    const feedbackMap = {};
    feedbackStats.forEach(stat => {
      feedbackMap[stat._id.toString()] = stat.avgRating;
    });

    const formattedProviders = providers.map(p => {
      const dynamicRating = feedbackMap[p._id.toString()];
      return {
        _id: p._id,
        name: p.fullName,
        category: p.serviceCategory,
        trade: p.providerSubService,
        experience: p.experience || 0,
        rating: dynamicRating !== undefined ? dynamicRating : (p.rating || 0),
        profilePhoto: p.profilePhoto,
        city: p.city || ""
      };
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      providers: formattedProviders
    });
  } catch (error) {
    console.error("Error fetching providers for service:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

/* ------------------------------------------------------------------
   GET HIGH DEMAND SERVICES (PUBLIC)
   Endpoint: GET /services/high-demand
-------------------------------------------------------------------*/
export const getHighDemandServices = async (req, res) => {
  try {
    // For now, we take some active services. In production, this can be
    // based on real booking volume analysis.
    const services = await Service.find({ status: "active" })
      .sort({ createdAt: -1 }) // Taking most recently added active services as "trending"
      .limit(6)
      .select("category subService imageUrl description");

    const formattedServices = services.map(s => ({
      title: s.subService || s.category,
      img: s.imageUrl || "default-service.png",
      desc: s.description
    }));

    return res.status(StatusCodes.OK).json({ success: true, data: formattedServices });
  } catch (error) {
    console.error("Error fetching high demand services:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Internal Server Error" });
  }
};

