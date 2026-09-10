import { sleep, group } from 'k6';
import { fetchProviderNotifications, fetchUnreadNotificationCount, markNotificationAsRead } from './api_helpers.js';

export const options = {
    scenarios: {
        provider_notifications_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 notification interactions per second
            timeUnit: '1s',
            duration: '1m', 
            preAllocatedVUs: 200,
            maxVUs: 2000,
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<1000'],
        http_req_failed: ['rate<0.05'],
    },
};

export default function () {
    const providerToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const notificationId = '69bbc75f1902feb6f6e2c4d6'; // Placeholder

    group('Provider Notification Operations', function () {
        // 1. Fetch unread count (high frequency polling simulation)
        fetchUnreadNotificationCount(providerToken);
        sleep(0.5);

        // 2. Fetch notification list
        fetchProviderNotifications(providerToken);
        sleep(0.5);

        // 3. Mark a notification as read
        markNotificationAsRead(providerToken, notificationId);
    });

    sleep(1);
}
