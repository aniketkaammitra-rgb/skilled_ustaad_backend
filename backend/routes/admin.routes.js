import { Router } from "express";
import { getStats, getRevenueAnalytics, getCustomers, updateCustomerStatus, getProviders, updateProviderStatus, resetProviderStrikes, getFinanceTransactions, getFinanceTotal, getNotificationSettings, updateNotificationSettings, getGeneralSettings, updateGeneralSettings, getSupportInfo, updateSupportInfo, submitSupportQuery, getSupportQueries, updateSupportQueryStatus, submitSecOpsReport, getSecOpsReports, updateSecOpsReportStatus, getBookings, getAdminNotifications, markNotificationsRead, getPayouts, updatePayoutStatus, refundBookingToWallet, rotateSecurityKeys, cancelBookingAdmin } from "../controllers/admin.controller.js";
import { requireAuth, requireSuperAdmin, requirePermission } from "../middleware/requireAuth.js";
import { upload } from "../middleware/uploadMiddleware.js";
import { createSubAdmin, getSubAdmins, updateSubAdmin, deleteSubAdmin } from "../controllers/subadmin.controller.js";

const router = Router();

// Sub-Admins Management (Super Admin ONLY)
router.post("/subadmins", requireSuperAdmin, createSubAdmin);
router.get("/subadmins", requireSuperAdmin, getSubAdmins);
router.put("/subadmins/:id", requireSuperAdmin, updateSubAdmin);
router.delete("/subadmins/:id", requireSuperAdmin, deleteSubAdmin);

// Dashboard Statistics (Admin ONLY ideally, but using existing Auth for simplicity as per current pattern)
router.get("/stats", requireAuth, getStats);
router.get("/revenue", requireAuth, getRevenueAnalytics);

// Members Management
router.get("/customers", requirePermission("manage_users"), getCustomers);
router.put("/customers/:id", requirePermission("manage_users"), updateCustomerStatus);
router.get("/providers", requirePermission("manage_providers"), getProviders);
router.put("/providers/:id", requirePermission("manage_providers"), updateProviderStatus);
router.post("/providers/:id/reset-strikes", requirePermission("manage_providers"), resetProviderStrikes);
router.get("/bookings", requirePermission("manage_bookings"), getBookings);
router.post("/bookings/:id/refund", requirePermission("manage_bookings"), refundBookingToWallet);
router.post("/bookings/:id/cancel", requirePermission("manage_bookings"), cancelBookingAdmin);

// Finance Management
router.get("/finance", requirePermission("manage_finance"), getFinanceTransactions);
router.get("/finance/total", requirePermission("manage_finance"), getFinanceTotal);

// Notification Management
router.get("/notifications/list", requireAuth, getAdminNotifications);
router.put("/notifications/read-all", requireAuth, markNotificationsRead);
router.get("/notifications", requireAuth, getNotificationSettings);
router.put("/notifications", requireAuth, updateNotificationSettings);

// General Settings
router.get("/settings", requirePermission("manage_settings"), getGeneralSettings);
router.put("/settings", requirePermission("manage_settings"), updateGeneralSettings);
router.post("/security/rotate-keys", requireSuperAdmin, rotateSecurityKeys);

// Support & Help Desk
router.get("/support", getSupportInfo); // Publicly accessible to fetch FAQs
router.put("/support", requirePermission("manage_support"), updateSupportInfo);
router.post("/support/query", submitSupportQuery); // Public submission
router.get("/support/queries", requirePermission("manage_support"), getSupportQueries);
router.put("/support/queries/:id/status", requirePermission("manage_support"), updateSupportQueryStatus);
router.post("/sec-ops/report", requireAuth, submitSecOpsReport);
router.get("/sec-ops/reports", requireAuth, getSecOpsReports);
router.put("/sec-ops/reports/:id/status", requireAuth, updateSecOpsReportStatus);

// Payout Management
router.get("/payouts", requirePermission("manage_finance"), getPayouts);
router.put("/payouts/:id/process", requirePermission("manage_finance"), upload.single("receipt"), updatePayoutStatus);

export default router;
