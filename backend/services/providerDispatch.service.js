import Provider from "../models/Provider.js";
import Booking from "../models/Booking.js";
import ProviderNotification from "../models/ProviderNotification.js";
import { sendProviderNotification } from "./fcm.service.js";
/*
=====================================================
CONFIG
=====================================================
*/

const INITIAL_RADIUS = 5000;      // 5 KM
const MAX_RADIUS = 30000;         // 30 KM 
const STEP = 5000;                // 5 KM steps
const RESPONSE_TIMEOUT = 15000;    // 15 seconds wait per batch (optimized for 2 min search)
const MAX_SEARCH_TIME = 120000;    // 2 MINUTES Total Search Duration (Optimized for fast matching)

/*
=====================================================
HELPERS FOR DYNAMIC MATCHING (PRODUCTION GRADE)
=====================================================
*/

/**
 * Normalizes and stems a word to its core form.
 * Handles variations like Cleaning/Cleaner, Repair/Repairs, etc.
 */
function getStem(word) {
  if (!word) return "";
  return word.toLowerCase().trim()
    .replace(/(ing|er|ers|es|s|ed|ly|ation|ments|ment|al|ian|ry|ic)$/, "") // Strip suffixes
    .replace(/[^\w\s]/g, ""); // Remove punctuation
}

const NOISE_WORDS = new Set(["service", "services", "full", "expert", "professional", "pro", "work", "works", "booking", "near", "me", "home", "house"]);

/**
 * Calculates similarity between two strings using token-based overlap.
 */
function getSimilarityScore(str1, str2) {
  const set1 = new Set(str1.split(/\s+/).map(getStem).filter(s => s.length >= 2 && !NOISE_WORDS.has(s)));
  const set2 = new Set(str2.split(/\s+/).map(getStem).filter(s => s.length >= 2 && !NOISE_WORDS.has(s)));

  if (set1.size === 0 || set2.size === 0) {
    // If one is empty after filtering, check if they were identical before filtering (case insensitive)
    if (str1.toLowerCase().trim() === str2.toLowerCase().trim()) return 1.0;
    return 0;
  }

  let intersectionSize = 0;
  for (const stem of set1) {
    if (set2.has(stem)) intersectionSize++;
  }

  // REMOVED SUBSET RULE: It was too broad (e.g. "Development" matching "Website Development")
  // We now rely on the Dice Coefficient score for more precision.
  const unionSize = new Set([...set1, ...set2]).size;
  return intersectionSize / unionSize;
}

/**
 * Checks if a provider matches a skill base using a Scalable Similarity Algorithm.
 */
function isBroadMatch(provider, skillBase) {
  const specificTasks = Array.isArray(provider.subService) ? provider.subService : [];
  const primaryTrade = (provider.providerSubService || "").toLowerCase().trim();
  const sBase = skillBase.toLowerCase().trim();

  // 1. If provider has SPECIFIC TASKS, we match against them.
  if (specificTasks.length > 0) {
    const taskMatch = specificTasks.some(task => {
      const t = task.toLowerCase().trim();
      if (sBase === t) return true;

      const score = getSimilarityScore(sBase, t);
      // Using 0.85 for specific tasks to ensure high precision
      if (score >= 0.85) return true;
      return false;
    });
    if (taskMatch) return true;

    // Even if specific tasks don't match, we check the primary trade as a fallback 
    // to ensure generalists aren't locked out of their main category.
  }

  // 2. Fall back to Primary Trade (Generalist mode)
  if (primaryTrade) {
    const pTrade = primaryTrade.toLowerCase().trim();
    // For general trades, we use a higher threshold (0.7) to avoid broad category matches
    return sBase === pTrade || getSimilarityScore(sBase, pTrade) >= 0.7;
  }

  return false;
}

/*
=====================================================
MAIN DISPATCH FUNCTION
=====================================================
*/
export async function dispatchProviders(bookingId) {
  try {
    const startTime = Date.now();
    // console.log("🚀 DISPATCH STARTED FOR:", bookingId);

    const booking = await Booking.findById(bookingId).populate("userId", "fullName phoneNumber");
    if (!booking || booking.status !== "pending") {
      // console.log("Booking unavailable for dispatch - skipping");
      return;
    }

    // Identify all requested skills (Primary + Add-ons)
    const ServiceModel = (await import("../models/Service.js")).default;
    const serviceDetails = await ServiceModel.findById(booking.service?._id || booking.service);

    const primarySkill = serviceDetails?.subService || booking.serviceType || serviceDetails?.providerSubService || "";
    const addonSkills = (booking.addOns || []).map(a => a.name);
    const allRequiredSkills = [primarySkill, ...addonSkills].filter(Boolean).map(s => s.toString().trim().toLowerCase());

    let radius = INITIAL_RADIUS;
    const notifiedProviderIds = new Set(); // TRACK NOTIFIED PROVIDERS FOR THIS SEARCH SESSION

    // 10 MINUTES SEARCH LOOP
    while (Date.now() - startTime < MAX_SEARCH_TIME) {
      if (radius > MAX_RADIUS) radius = MAX_RADIUS; // Caps radius but keeps looping for time

      // console.log(`Searching providers [Radius: ${radius}m] [Elapsed: ${Math.round((Date.now() - startTime) / 1000)}s]`);

      // 1. Generate search terms using tokens and stems for the database query
      const allSearchTerms = new Set();
      allRequiredSkills.forEach(skill => {
        const tokens = skill.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
        tokens.forEach(t => {
          allSearchTerms.add(t);
          allSearchTerms.add(getStem(t)); // Add stemmed version for broader DB fetch
        });
      });

      const searchRegex = new RegExp(Array.from(allSearchTerms).join("|"), "i");

      const query = {
        status: "Active",
        isAvailable: true,
        _id: { $nin: Array.from(notifiedProviderIds).concat(booking.declinedProvider || []) }, // Skip notified & declined
        location: {
          $near: {
            $geometry: booking.location,
            $maxDistance: radius,
          },
        },
        // We ONLY match by subService or providerSubService (the specific skills)
        // Matching by serviceCategory is too broad and notifies everyone in the sector.
        $or: [
          { subService: { $regex: searchRegex } },
          { providerSubService: { $regex: searchRegex } }
        ]
      };

      let providers = await Provider.find(query).limit(20); // Limit batch size for performance

      // 2. Perform broad fuzzy match check against any of the requested skills
      providers = providers.filter(p =>
        allRequiredSkills.some(skill => isBroadMatch(p, skill))
      );

      if (providers.length > 0) {
        // console.log(`Found ${providers.length} NEW candidates in ${radius}m. Notifying...`);

        const notifications = providers.map(async (provider) => {
          try {
            notifiedProviderIds.add(provider._id.toString());

            await ProviderNotification.create({
              providerId: provider._id,
              bookingId: booking._id,
              type: "booking_request",
              title: "New Booking Nearby",
              message: `New request: ${booking.serviceType} at ₹${booking.price}. Be the first to accept!`,
              metadata: {
                price: booking.price,
                location: booking.location,
                customerName: booking.userId?.fullName,
                serviceType: booking.serviceType,
                date: booking.date,
                time: booking.time
              },
              status: "pending",
            });

            await sendProviderNotification(provider, booking);

            try {
              const { getIO } = await import("../libs/socket.js");
              getIO().to(`provider_${provider._id.toString()}`).emit("booking_request", {
                ...booking.toObject(),
                service: booking.service
              });
            } catch (ioErr) { }

            return provider._id;
          } catch (err) { return null; }
        });

        await Promise.all(notifications);
      }

      // Wait for someone to accept (polling state check)
      const accepted = await waitForAcceptance(booking._id, RESPONSE_TIMEOUT);
      if (accepted) {
        // console.log("✅ Booking ACCEPTED!");
        return;
      }

      // Expansion Logic: Only expand radius after checking current pool
      if (radius < MAX_RADIUS) {
        radius += STEP;
      } else if (providers.length === 0) {
        // If we reached MAX_RADIUS and found 0 NEW providers in this batch, 
        // it means we've notified everyone available in the 30km zone.
        // We do one final wait cycle then exit early to avoid "infinite pooling"
        // console.log("⏳ Searched Max Radius and no more new providers. Concluding search...");
        const lastCheck = await waitForAcceptance(booking._id, RESPONSE_TIMEOUT);
        if (!lastCheck) break;
      } else {
        // console.log("⏳ Searched Max Radius. Retrying Pool for remainder of search window...");
      }
    }

    // console.log("❌ 10-minutes timed out. No provider found.");

    const finalBooking = await Booking.findById(bookingId);
    if (finalBooking && (finalBooking.status === "paid" || finalBooking.status === "pending")) {
      finalBooking.status = "no_provider_found";
      await finalBooking.save();

      // Final Socket Notification
      try {
        const { getIO } = await import("../libs/socket.js");
        getIO().to(`user_${finalBooking.userId}`).emit("booking_failed", {
          bookingId: finalBooking._id,
          message: "Sorry, no professional was found after 2 minutes search."
        });
      } catch (e) { }
    }

  } catch (error) {
    console.error("Dispatch Error:", error);
  }
}

/*
=====================================================
WAIT FOR ACCEPTANCE
=====================================================
*/

function waitForAcceptance(bookingId, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const interval = setInterval(async () => {
      const booking = await Booking.findById(bookingId).select("status providerId");
      if (booking?.providerId) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 3000);
  });
}
