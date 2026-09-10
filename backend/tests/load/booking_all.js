import { sleep, group } from 'k6';
import { createBooking, getAvailableBookings, getUserBookings, updateBookingStatus } from './api_helpers.js';

export const options = {
    scenarios: {
        booking_load_sim: {
            executor: 'constant-arrival-rate',
            rate: 200, // 200 booking-related flows per second (12,000/min)
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 400,
            maxVUs: 5000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const providerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder

    group('Booking Lifecycle Flow', function () {
        // 1. User creates a booking
        const createRes = createBooking(userToken);
        sleep(1);

        if (createRes.status === 201 || createRes.status === 200) {
            const bookingId = createRes.json().booking?.id || createRes.json().booking?._id;

            // 2. Provider checks available bookings
            getAvailableBookings(providerToken);
            sleep(1);

            if (bookingId) {
                // 3. Provider accepts the booking
                updateBookingStatus(providerToken, bookingId, 'accepted');
                sleep(1);

                // 4. Provider starts the job
                updateBookingStatus(providerToken, bookingId, 'in-progress');
                sleep(2);

                // 5. Provider completes the job
                updateBookingStatus(providerToken, bookingId, 'completed');
            }
        }

        // 6. User checks their booking history
        getUserBookings(userToken);
        sleep(1);
    });
}
