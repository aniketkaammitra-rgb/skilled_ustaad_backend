import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = 'http://localhost:5000/api/v1';

export function requestUserOTP(phoneNumber) {
    const res = http.post(`${BASE_URL}/auth/request-otp`, JSON.stringify({ 
      fullName: 'Test User',
      phoneNumber 
    }), {
        headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'OTP requested': (r) => r.status === 200 || r.status === 201 });
    return res;
}

export function verifyUserOTP(phoneNumber, otp) {
    const res = http.post(`${BASE_URL}/auth/verify-otp`, JSON.stringify({ phoneNumber, otp }), {
        headers: { 'Content-Type': 'application/json' },
    });
    check(res, { 'OTP verified': (r) => r.status === 200 });
    return res;
}

export function refreshUserToken(refreshToken) {
    const res = http.post(`${BASE_URL}/auth/refresh-token`, null, {
        headers: { 'Cookie': `refreshToken=${refreshToken}` },
    });
    check(res, { 'Token refreshed': (r) => r.status === 200 });
    return res;
}

export function logoutUser() {
    const res = http.post(`${BASE_URL}/auth/logout`);
    check(res, { 'Logged out': (r) => r.status === 204 || r.status === 200 });
    return res;
}

export function updateProfile(token, data) {
    const res = http.put(`${BASE_URL}/auth/profile`, JSON.stringify(data), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Profile updated': (r) => r.status === 200 });
    return res;
}

export function requestDeactivateAccount(token) {
    const res = http.post(`${BASE_URL}/auth/deactivate/request-otp`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Deactivation OTP requested': (r) => r.status === 200 });
    return res;
}

export function verifyDeactivation(token, otp) {
    const res = http.post(`${BASE_URL}/auth/deactivate/verify-otp`, JSON.stringify({ otp }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Deactivation verified': (r) => r.status === 200 });
    return res;
}

export function fetchServices(token, city = 'Patna', query = '') {
    const res = http.get(`${BASE_URL}/services?city=${city}&query=${query}&page=1&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Services fetched': (r) => r.status === 200 });
    return res;
}

export function fetchServiceById(token, serviceId) {
    const res = http.get(`${BASE_URL}/services/${serviceId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Service detail fetched': (r) => r.status === 200 });
    return res;
}

export function fetchProviderJobs(token) {
    const res = http.get(`${BASE_URL}/provider/jobs?page=1&limit=10`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Jobs fetched': (r) => r.status === 200 });
    return res;
}

export function fetchProviderEarnings(token) {
  const res = http.get(`${BASE_URL}/provider/earnings/dashboard`, {
      headers: { 'Authorization': `Bearer ${token}` },
  });
  check(res, { 'Earnings dashboard fetched': (r) => r.status === 200 });
  return res;
}

export function fetchProviderTransactionHistory(token) {
    const res = http.get(`${BASE_URL}/provider/earnings/transactions?page=1&limit=20`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Transaction history fetched': (r) => r.status === 200 });
    return res;
}

export function requestWithdrawal(token, amount, methodId) {
    const res = http.post(`${BASE_URL}/provider/earnings/withdraw`, JSON.stringify({ amount, methodId }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Withdrawal requested': (r) => r.status === 200 });
    return res;
}

export function fetchProviderProfile(token) {
    const res = http.get(`${BASE_URL}/provider/profile`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Profile fetched': (r) => r.status === 200 });
    return res;
}

export function fetchProviderDashboard(token) {
    const res = http.get(`${BASE_URL}/provider/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Dashboard metrics fetched': (r) => r.status === 200 });
    return res;
}

export function fetchProviderNotifications(token) {
    const res = http.get(`${BASE_URL}/provider/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Notifications fetched': (r) => r.status === 200 });
    return res;
}

export function fetchUnreadNotificationCount(token) {
    const res = http.get(`${BASE_URL}/provider/notifications/unread-count`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Unread count fetched': (r) => r.status === 200 });
    return res;
}

export function markNotificationAsRead(token, notificationId) {
    const res = http.patch(`${BASE_URL}/provider/notifications/${notificationId}/read`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Notification marked as read': (r) => r.status === 200 });
    return res;
}

export function toggleProviderAvailability(token, isAvailable) {
    const res = http.patch(`${BASE_URL}/provider/availability`, JSON.stringify({ isAvailable }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Availability toggled': (r) => r.status === 200 });
    return res;
}

export function providerBookingAction(token, bookingId, action) {
    const res = http.post(`${BASE_URL}/provider/booking/action`, JSON.stringify({ bookingId, action }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Provider action completed': (r) => r.status === 200 });
    return res;
}

export function getProviderDashboard(token) {
    const res = http.get(`${BASE_URL}/provider/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Dashboard fetched': (r) => r.status === 200 });
    return res;
}

export function getProviderBookingPaymentDetail(token, bookingId) {
    const res = http.get(`${BASE_URL}/providerBookingPaymentDetail/booking-payment/${bookingId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Details fetched': (r) => r.status === 200 });
    return res;
}

export function markWorkAsCompleted(token, bookingId) {
    const res = http.patch(`${BASE_URL}/providerBookingPaymentDetail/work-complete/${bookingId}`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Work marked complete': (r) => r.status === 200 });
    return res;
}

export function confirmPaymentReceived(token, bookingId) {
    const res = http.patch(`${BASE_URL}/providerBookingPaymentDetail/confirm-payment/${bookingId}`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Payment confirmed': (r) => r.status === 200 });
    return res;
}

export function getAvailableBookings(token) {
    const res = http.get(`${BASE_URL}/booking/available`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Available bookings fetched': (r) => r.status === 200 });
    return res;
}

export function getUserBookings(token) {
    const res = http.get(`${BASE_URL}/booking/my-bookings`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'User bookings fetched': (r) => r.status === 200 });
    return res;
}

export function updateBookingStatus(token, bookingId, status) {
    const res = http.patch(`${BASE_URL}/provider/jobs/${bookingId}/status`, JSON.stringify({ status }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Status updated': (r) => r.status === 200 });
    return res;
}

export function cancelBooking(token, bookingId) {
    const res = http.put(`${BASE_URL}/booking/${bookingId}/cancel`, {}, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Booking cancelled': (r) => r.status === 200 });
    return res;
}

export function fetchBookingById(token, bookingId) {
    const res = http.get(`${BASE_URL}/booking/${bookingId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Booking by ID fetched': (r) => r.status === 200 });
    return res;
}

export function fetchBookingDetailsPage(token, bookingId) {
    const res = http.get(`${BASE_URL}/booking/${bookingId}/details`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Details page fetched': (r) => r.status === 200 });
    return res;
}

export function acceptBooking(token, bookingId) {
    const res = http.post(`${BASE_URL}/booking/accept-booking`, JSON.stringify({ bookingId }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Booking accepted': (r) => r.status === 200 });
    return res;
}

export function completeBooking(token, bookingId) {
    const res = http.post(`${BASE_URL}/booking/complete-booking`, JSON.stringify({ bookingId }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Booking completed': (r) => r.status === 200 });
    return res;
}

export function createBooking(token) {
  const payload = JSON.stringify({
    service: "69aab0eab6c562545f51d540",
    serviceType: "Cooking",
    date: "2026-03-20",
    time: "15:00",
    address: "Kankarbagh, Patna, Bihar 800020, India",
    city: "Patna",
    state: "Bihar",
    price: 500,
    latitude: 25.5941,
    longitude: 85.1376
  });
  
  const res = http.post(`${BASE_URL}/booking`, payload, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  check(res, { 'Booking created': (r) => r.status === 201 });
  return res;
}

export function submitFeedback(token, bookingId, rating, message, category) {
    const res = http.post(`${BASE_URL}/feedback/${bookingId}`, JSON.stringify({ 
        rating, 
        message, 
        category 
    }), {
        headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
    });
    check(res, { 'Feedback submitted': (r) => r.status === 201 || r.status === 200 });
    return res;
}

export function getBookingDetail(token, bookingId) {
    const res = http.get(`${BASE_URL}/booking/${bookingId}/details`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    check(res, { 'Booking detail fetched': (r) => r.status === 200 });
    return res;
}

export function generateBookingOTP(token, bookingId) {
    const res = http.post(`${BASE_URL}/otp/booking-otp`, JSON.stringify({ bookingId }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Booking OTP generated': (r) => r.status === 200 });
    return res;
}

export function generateCompletionOTP(token, bookingId) {
    const res = http.post(`${BASE_URL}/otp/completion-otp`, JSON.stringify({ bookingId }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Completion OTP generated': (r) => r.status === 200 });
    return res;
}

export function validateBookingOtp(token, bookingId, otp) {
    const res = http.post(`${BASE_URL}/otp/validate-booking-otp`, JSON.stringify({ bookingId, otp }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Booking OTP validated': (r) => r.status === 200 });
    return res;
}

export function validateCompletionOtp(token, bookingId, otp) {
    const res = http.post(`${BASE_URL}/otp/validate-completion-otp`, JSON.stringify({ bookingId, otp }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Completion OTP validated': (r) => r.status === 200 });
    return res;
}

export function createTokenOrder(token, bookingId) {
    const res = http.post(`${BASE_URL}/payment/token`, JSON.stringify({ bookingId }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Token order created': (r) => r.status === 200 });
    return res;
}

export function verifyTokenPayment(token, orderId, paymentId, signature) {
    const res = http.post(`${BASE_URL}/payment/token/verify`, JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
    }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Token payment verified': (r) => r.status === 200 });
    return res;
}

export function createFullPayment(token, bookingId) {
    const res = http.post(`${BASE_URL}/payment/full`, JSON.stringify({ bookingId, method: 'Razorpay' }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Full payment order created': (r) => r.status === 201 });
    return res;
}

export function verifyFullPayment(token, orderId, paymentId, signature) {
    const res = http.post(`${BASE_URL}/payment/verify`, JSON.stringify({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
    }), {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    check(res, { 'Full payment verified': (r) => r.status === 200 });
    return res;
}
