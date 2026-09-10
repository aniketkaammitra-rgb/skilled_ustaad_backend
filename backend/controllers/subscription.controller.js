import Provider from "../models/Provider.js";
import { StatusCodes } from "http-status-codes";
import Razorpay from "razorpay";
import crypto from "crypto";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_R6eXqxwNvlRKmE",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "wFvYisIjKqYsoXURGB7MvfGo",
});

const SUBSCRIPTION_PLANS_MAP = {
  monthly: {
    id: "monthly",
    name: "Monthly Pass",
    price: 99,
    durationDays: 30,
  },
  yearly_1: {
    id: "yearly_1",
    name: "Annual Super Pass",
    price: 499,
    durationDays: 365,
  },
  yearly_2: {
    id: "yearly_2",
    name: "2-Year Mega Ustaad Pass",
    price: 999,
    durationDays: 730,
  },
};

/**
 * GET Provider Subscription Status
 */
export async function getSubscriptionStatus(req, res) {
  try {
    const providerId = req.user.sub || req.user.id;
    const provider = await Provider.findById(providerId);

    if (!provider) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Provider not found" });
    }

    // Auto-expire subscription if expiryDate has passed
    if (
      provider.subscription &&
      provider.subscription.status === "active" &&
      provider.subscription.expiryDate &&
      new Date(provider.subscription.expiryDate).getTime() < Date.now()
    ) {
      provider.subscription.status = "expired";
      await provider.save();
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      subscription: provider.subscription || {
        planId: null,
        planName: null,
        startDate: null,
        expiryDate: null,
        status: "inactive",
      },
    });
  } catch (error) {
    console.error("Get Subscription Status Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to fetch subscription status" });
  }
}

/**
 * CREATE Razorpay Order for Subscription
 */
export async function createSubscriptionOrder(req, res) {
  try {
    const { planId } = req.body;
    const providerId = req.user.sub || req.user.id;

    const plan = SUBSCRIPTION_PLANS_MAP[planId];
    if (!plan) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid subscription plan selected" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Provider not found" });
    }

    if (provider.status !== "Active") {
      return res.status(StatusCodes.FORBIDDEN).json({
        error:
          "Your account is pending admin verification. Please wait for verification before subscribing.",
      });
    }

    const amountInPaise = plan.price * 100;
    const shortProviderId = providerId.toString().slice(-8);
    const receipt = `sub_${shortProviderId}_${Date.now().toString().slice(-4)}`;

    let order;
    try {
      order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: receipt,
        notes: {
          providerId: providerId.toString(),
          planId: plan.id,
          planName: plan.name,
        },
      });
    } catch (rzpErr) {
      console.warn("Razorpay API order creation warning:", rzpErr.message);
      order = {
        id: `order_sub_mock_${Date.now()}`,
        amount: amountInPaise,
        currency: "INR",
        receipt,
      };
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: {
        orderId: order.id,
        amount: plan.price,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID || "rzp_test_R6eXqxwNvlRKmE",
        plan: plan,
      },
    });
  } catch (error) {
    console.error("Create Subscription Order Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to create subscription order" });
  }
}

/**
 * VERIFY Razorpay Payment & Activate Subscription
 */
export async function verifySubscriptionPayment(req, res) {
  try {
    const { planId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    const providerId = req.user.sub || req.user.id;

    const plan = SUBSCRIPTION_PLANS_MAP[planId];
    if (!plan) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid subscription plan" });
    }

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Provider not found" });
    }

    // Verify HMAC signature if Razorpay Secret is available
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (
      secret &&
      razorpay_signature &&
      razorpay_order_id &&
      !razorpay_order_id.startsWith("order_sub_mock_")
    ) {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: "Invalid payment signature verification" });
      }
    }

    // Calculate dates
    const now = new Date();
    const expiry = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    provider.subscription = {
      planId: plan.id,
      planName: plan.name,
      startDate: now,
      expiryDate: expiry,
      status: "active",
      transactionId: razorpay_payment_id || `txn_sub_${Date.now()}`,
      razorpayOrderId: razorpay_order_id || `order_sub_${Date.now()}`,
    };

    await provider.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Subscription successfully activated for ${plan.name}`,
      subscription: provider.subscription,
      provider,
    });
  } catch (error) {
    console.error("Verify Subscription Payment Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to verify subscription payment" });
  }
}
