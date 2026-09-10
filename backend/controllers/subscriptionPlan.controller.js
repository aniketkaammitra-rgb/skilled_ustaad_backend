import SubscriptionPlan from "../models/SubscriptionPlan.js";

// @desc    Get all active subscription plans (for provider frontend)
// @route   GET /api/subscription-plans/active
// @access  Public / Provider
export const getActivePlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find({ isActive: true }).sort({ price: 1 });
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// @desc    Get all subscription plans (for admin frontend)
// @route   GET /api/subscription-plans
// @access  Admin
export const getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find().sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

// @desc    Create a new subscription plan
// @route   POST /api/subscription-plans
// @access  Admin
export const createPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json({ success: true, data: plan, message: "Plan created successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to create plan", error: error.message });
  }
};

// @desc    Update a subscription plan
// @route   PUT /api/subscription-plans/:id
// @access  Admin
export const updatePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    res.status(200).json({ success: true, data: plan, message: "Plan updated successfully" });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to update plan", error: error.message });
  }
};

// @desc    Delete (or deactivate) a subscription plan
// @route   DELETE /api/subscription-plans/:id
// @access  Admin
export const deletePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) {
      return res.status(404).json({ success: false, message: "Plan not found" });
    }
    // Hard delete or soft delete? We'll hard delete for now, or maybe soft delete is safer.
    // Let's hard delete for simplicity.
    await plan.deleteOne();
    res.status(200).json({ success: true, message: "Plan deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete plan", error: error.message });
  }
};
