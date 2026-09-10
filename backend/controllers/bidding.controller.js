import mongoose from "mongoose";
import BiddingRequest from "../models/BiddingRequest.js";
import Bid from "../models/Bid.js";
import Provider from "../models/Provider.js";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import UserNotification from "../models/UserNotification.js";
import ProviderNotification from "../models/ProviderNotification.js";
import Service from "../models/Service.js";
import { StatusCodes } from "http-status-codes";
import { sendUserNotification, sendProviderNotification, sendAdminNotification } from "../services/fcm.service.js";

const NOISE_WORDS = new Set(["service", "services", "expert", "professional", "pro", "work", "works", "booking", "near", "me", "home", "house", "digital"]);

/* =====================================================
   CUSTOMER: CREATE BIDDING REQUEST
===================================================== */
export async function createBiddingRequest(req, res) {
  try {
    const {
      customerName,
      category,
      subService,
      description,
      budget,
      deadline,
      keyFeatures,
      technicalAssets,
      // Optional/Legacy fields
      address,
      city,
      latitude,
      longitude,
    } = req.body;

    const userId = req.user.sub || req.user.id;

    if (!category || !subService || !description || !budget || !deadline) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Missing required fields" });
    }

    // Attempt to fetch city from user profile if not provided
    let finalCity = city;
    let finalAddress = address || "Not provided";
    let finalLocation = { type: "Point", coordinates: [longitude || 0, latitude || 0] };

    if (!finalCity) {
      const user = await User.findById(userId);
      finalCity = user?.address?.city || user?.city || "Unknown";
      if (user?.address?.fullAddress) finalAddress = user.address.fullAddress;
    }

    const newRequest = await BiddingRequest.create({
      userId,
      customerName,
      category,
      subService,
      description,
      budget,
      deadline: new Date(deadline),
      keyFeatures,
      technicalAssets,
      address: finalAddress,
      city: finalCity,
      location: finalLocation,
    });

    // Notify Providers in this category, specific sub-service and city (Async)
    // Handle rebranding: consolidate all digital variations
    const categoryQuery = (category === "Digital Work" || category === "Digital Works" || category === "Digital Services" || category === "Web Development" || category === "Biding Services") 
      ? { $in: ["Digital Work", "Digital Works", "Digital Services", "Biding Services", "Web Development"] } 
      : category;

    // Improved provider lookup: Use keyword-based regex to handle typos and variations
    const searchTerms = subService.split(/\s+/).filter(t => t.length >= 3 && !NOISE_WORDS.has(t.toLowerCase()));
    const searchRegex = new RegExp(searchTerms.join("|"), "i");

    const providers = await Provider.find({
      serviceCategory: categoryQuery,
      status: "Active",
      isAvailable: true,
      $or: [
        { subService: { $regex: searchRegex } },
        { providerSubService: { $regex: searchRegex } }
      ],
    });

    providers.forEach(async (provider) => {
      // Save notification to DB
      await ProviderNotification.create({
        providerId: provider._id,
        type: "bidding_request",
        title: "📢 New Bidding Opportunity",
        message: `New request for ${subService} in ${finalCity}. Budget: ₹${budget}.`,
        metadata: { requestId: newRequest._id.toString() }
      });

      // Send Push
      sendProviderNotification(provider, {
        title: "📢 New Bidding Opportunity",
        body: `New request for ${subService} in ${finalCity}. Budget: ₹${budget}.`,
        data: { requestId: newRequest._id.toString(), type: "BIDDING_REQUEST" }
      });
    });

    res.status(StatusCodes.CREATED).json({
      message: "Bidding request created successfully",
      request: newRequest,
    });
  } catch (error) {
    console.error("Create Bidding Request Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to create bidding request" });
  }
}

/* =====================================================
   PROVIDER: GET ALL OPEN REQUESTS
===================================================== */
export async function getOpenRequests(req, res) {
  try {
    // Auto-expire requests older than 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await BiddingRequest.updateMany(
      { status: "open", createdAt: { $lt: fiveDaysAgo } },
      { $set: { status: "cancelled" } }
    );

    const { category, city, subService: querySubService } = req.query;
    const query = { status: "open" };

    // If user is a provider, we should ideally show them only relevant bids based on their skills
    // if they haven't explicitly filtered by a specific subService.
    let skillFilter = querySubService;
    
    if (req.user && req.user.role === "provider") {
      const provider = await Provider.findById(req.user.sub).select("subService providerSubService status");
      if (!provider || provider.status !== "Active") {
        return res.status(StatusCodes.OK).json({ success: true, requests: [] });
      }
      // Use their registered skills for filtering
      skillFilter = [
        ...(Array.isArray(provider.subService) ? provider.subService : []),
        provider.providerSubService
      ].filter(Boolean);
      
      if (skillFilter.length === 0) skillFilter = null;
    }

    if (category) {
      if (category === "Digital Work" || category === "Digital Works" || category === "Digital Services" || category === "Biding Services" || category === "Web Development") {
        query.category = { $in: ["Digital Work", "Digital Works", "Digital Services", "Biding Services", "Web Development"] };
      } else {
        query.category = category;
      }
    }

    const isDigital = category && ["Digital Work", "Digital Works", "Digital Services", "Biding Services", "Web Development"].some(
      cat => cat.toLowerCase() === category.toLowerCase()
    );

    if (city && !isDigital) {
      query.city = city;
    }

    if (skillFilter) {
      const allTerms = (Array.isArray(skillFilter) ? skillFilter : [skillFilter])
        .flatMap(s => s.split(/\s+/).filter(t => t.length >= 3 && !NOISE_WORDS.has(t.toLowerCase())));
      
      if (allTerms.length > 0) {
        query.subService = { $regex: allTerms.join("|"), $options: "i" };
      }
    }

    const requests = await BiddingRequest.find(query)
      .populate("userId", "fullName profilePhoto")
      .sort({ createdAt: -1 })
      .lean();

    const requestsWithService = await Promise.all(
      requests.map(async (request) => {
        const matchedService = await Service.findOne({
          subService: { $regex: new RegExp("^\\s*" + request.subService.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
        }).select("imageUrl").lean();
        
        return {
          ...request,
          service: matchedService ? { imageUrl: matchedService.imageUrl } : null
        };
      })
    );

    res.status(StatusCodes.OK).json({ success: true, requests: requestsWithService });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch requests" });
  }
}

/* =====================================================
   PROVIDER: PLACE BID
===================================================== */
export async function placeBid(req, res) {
  try {
    const { requestId, amount, message, estimatedDuration, proposal, experience, proofOfWorkImage, projectLink } = req.body;
    const providerId = req.user.sub || req.user.id;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Request ID format" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Provider not found" });
    }

    if (provider.status !== "Active") {
      return res.status(StatusCodes.FORBIDDEN).json({ error: "Your account is pending verification. You cannot place bids." });
    }

    const isSubActive =
      provider.subscription &&
      provider.subscription.status === "active" &&
      provider.subscription.expiryDate &&
      new Date(provider.subscription.expiryDate).getTime() > Date.now();

    if (!isSubActive) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: "Subscription Required: You need an active subscription plan to place bids on requests." });
    }

    if (!provider.isAvailable) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "You are offline. Please turn on your availability to send proposals." });
    }

    const request = await BiddingRequest.findById(requestId);
    if (!request || request.status !== "open") {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Request not found or closed" });
    }

    // Check if provider already bid
    const existingBid = await Bid.findOne({ requestId, providerId });
    if (existingBid) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "You have already placed a bid for this request" });
    }

    // Validate estimatedDuration: must be a positive integer, max 999 days
    const parsedDuration = Number(estimatedDuration);
    if (!estimatedDuration || isNaN(parsedDuration) || !Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 999) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Timeline must be a whole number of days between 1 and 999." });
    }

    const newBid = await Bid.create({
      requestId,
      providerId,
      amount,
      message: message || proposal || "New bid", // Fallback for message
      estimatedDuration: parsedDuration,
      proposal,
      experience,
      proofOfWorkImage,
      projectLink,
    });

    // Update bids count in request
    await BiddingRequest.findByIdAndUpdate(requestId, { $inc: { bidsCount: 1 } });

    // Notify Customer
    const user = await User.findById(request.userId);

    if (user) {
      await UserNotification.create({
        userId: user._id,
        type: "new_bid",
        title: "🔨 New Bid Received",
        message: `${provider.fullName} placed a bid of ₹${amount} for your ${request.subService} request.`,
        metadata: { requestId: requestId.toString(), bidId: newBid._id.toString() }
      });

      sendUserNotification(user, {
        title: "🔨 New Bid Received",
        body: `${provider.fullName} placed a bid of ₹${amount} for your ${request.subService} request.`,
        data: { requestId: requestId.toString(), type: "NEW_BID" }
      });
    }

    res.status(StatusCodes.CREATED).json({ message: "Bid placed successfully", bid: newBid });
  } catch (error) {
    console.error("Place Bid Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message || "Failed to place bid" });
  }
}

/* =====================================================
   CUSTOMER: GET BIDS FOR REQUEST
===================================================== */
export async function getBidsForRequest(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user.sub || req.user.id;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Request ID format" });
    }

    const request = await BiddingRequest.findOne({ _id: requestId, userId });
    if (!request) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Request not found" });
    }

    const bids = await Bid.find({ requestId })
      .populate("providerId", "fullName profilePhoto rating jobs")
      .sort({ amount: 1 });

    res.status(StatusCodes.OK).json({ success: true, bids });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message || "Failed to fetch bids" });
  }
}

/* =====================================================
   CUSTOMER: ACCEPT BID
===================================================== */
export async function acceptBid(req, res) {
  try {
    const requestId = req.body.requestId || req.params.requestId;
    const bidId = req.body.bidId || req.params.bidId;
    const userId = req.user.sub || req.user.id;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Request ID format" });
    }
    if (!bidId || !mongoose.Types.ObjectId.isValid(bidId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Bid ID format" });
    }

    const request = await BiddingRequest.findOne({ _id: requestId, userId, status: "open" });
    if (!request) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Request not found or already assigned" });
    }

    const bid = await Bid.findById(bidId);
    if (!bid || bid.status !== "pending") {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Bid not found" });
    }

    // Create a Booking Record in PENDING status
    const user = await User.findById(userId);
    const booking = await Booking.create({
      userId,
      providerId: bid.providerId,
      service: {
        category: request.category,
        subService: request.subService,
        requestId: request._id,
        bidId: bid._id // Store bidId to finalize after payment
      },
      serviceType: request.subService,
      address: request.address || "Not provided",
      city: request.city || "Unknown",
      state: user?.address?.state || user?.state || "Unknown",
      date: request.deadline || new Date(),
      time: "10:00 AM",
      price: bid.amount,
      status: "pending", 
      location: request.location || { type: "Point", coordinates: [0, 0] }
    });

    return res.status(StatusCodes.OK).json({
      message: "Bid acceptance initiated. Please complete payment.",
      bookingId: booking._id,
      amount: bid.amount
    });
  } catch (error) {
    console.error("Accept Bid Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message || "Failed to initiate bid acceptance" });
  }
}

/* =====================================================
   CUSTOMER: GET MY REQUESTS
===================================================== */
export async function getMyBiddingRequests(req, res) {
  try {
    // Auto-expire requests older than 5 days
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    await BiddingRequest.updateMany(
      { status: "open", createdAt: { $lt: fiveDaysAgo } },
      { $set: { status: "cancelled" } }
    );

    const userId = req.user.sub || req.user.id;
    const requests = await BiddingRequest.find({ userId }).sort({ createdAt: -1 }).lean();
    
    const requestsWithService = await Promise.all(
      requests.map(async (request) => {
        const matchedService = await Service.findOne({
          subService: { $regex: new RegExp("^\\s*" + request.subService.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
        }).select("imageUrl").lean();
        
        return {
          ...request,
          service: matchedService ? { imageUrl: matchedService.imageUrl } : null
        };
      })
    );
    
    res.status(StatusCodes.OK).json({ success: true, requests: requestsWithService });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch your requests" });
  }
}

/* =====================================================
   PROVIDER: GET MY BIDS
===================================================== */
export async function getProviderBids(req, res) {
  try {
    const providerId = req.user.sub || req.user.id;
    const bids = await Bid.find({ providerId })
      .populate("requestId")
      .sort({ createdAt: -1 });
    res.status(StatusCodes.OK).json({ success: true, bids });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: "Failed to fetch your bids" });
  }
}
/* =====================================================
   CUSTOMER: CANCEL BIDDING REQUEST
===================================================== */
export async function cancelBiddingRequest(req, res) {
  try {
    const { requestId } = req.params;
    const userId = req.user.sub || req.user.id;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Request ID format" });
    }

    // 1. Find the request and update status to cancelled
    const request = await BiddingRequest.findOneAndUpdate(
      { _id: requestId, userId, status: "open" },
      { status: "cancelled" },
      { new: true }
    );

    if (!request) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Request not found or cannot be cancelled (maybe it's already assigned or completed)" });
    }

    // 2. Find all providers who placed bids on this request
    const bids = await Bid.find({ requestId });
    const providerIds = bids.map(bid => bid.providerId);
    
    // Use unique providers to avoid duplicate notifications
    const uniqueProviderIds = [...new Set(providerIds.map(id => id.toString()))];

    // 3. Notify Providers
    if (uniqueProviderIds.length > 0) {
      const providers = await Provider.find({ _id: { $in: uniqueProviderIds } });
      
      for (const provider of providers) {
        // Save notification to DB
        await ProviderNotification.create({
          providerId: provider._id,
          type: "bid_cancelled",
          title: "❌ Bid Request Cancelled",
          message: `The customer has cancelled the request for ${request.subService}. Your bid has been automatically closed.`,
          metadata: { requestId: request._id.toString() }
        });

        // Send Push
        sendProviderNotification(provider, {
          title: "❌ Bid Request Cancelled",
          body: `The customer has cancelled the request for ${request.subService}.`,
          data: { requestId: request._id.toString(), type: "BID_CANCELLED" }
        });
      }
    }

    // 4. Notify Admin
    const user = await User.findById(userId);
    sendAdminNotification({
      type: "bid_request_cancelled",
      title: "🛑 Bid Request Cancelled",
      message: `${user?.fullName || "A customer"} cancelled their ${request.subService} bidding request.`,
      metadata: { 
        requestId: request._id.toString(),
        customerName: user?.fullName,
        subService: request.subService,
        budget: request.budget.toString()
      }
    });

    res.status(StatusCodes.OK).json({ 
      message: "Bidding request cancelled successfully. Notifications sent to providers and admin.", 
      request 
    });
  } catch (error) {
    console.error("Cancel Bidding Request Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message || "Failed to cancel bidding request" });
  }
}

/* =====================================================
   GET SINGLE BIDDING REQUEST BY ID
===================================================== */
export async function getBiddingRequestById(req, res) {
  try {
    const { requestId } = req.params;

    if (!requestId || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: "Invalid Request ID format" });
    }

    const request = await BiddingRequest.findById(requestId).lean();
    if (!request) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: "Request not found" });
    }
    
    const matchedService = await Service.findOne({
      subService: { $regex: new RegExp("^\\s*" + request.subService.trim().replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "\\s*$", "i") }
    }).select("imageUrl").lean();
    
    request.service = matchedService ? { imageUrl: matchedService.imageUrl } : null;
    
    res.status(StatusCodes.OK).json({ success: true, request });
  } catch (error) {
    console.error("Get Bidding Request Error:", error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: error.message || "Failed to fetch request" });
  }
}
