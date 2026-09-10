import { sleep, group } from 'k6';
import { 
    fetchProviderJobs, 
    fetchProviderEarnings, 
    fetchProviderProfile, 
    fetchProviderDashboard, 
    fetchProviderNotifications,
    toggleProviderAvailability
} from './api_helpers.js';

export const options = {
    scenarios: {
        provider_all_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 provider cycles per second
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
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder

    group('Provider Workday Flow', function () {
        // 1. Provider checks dashboard and profile
        fetchProviderDashboard(token);
        fetchProviderProfile(token);
        sleep(0.5);

        // 2. Checks for new jobs and notifications
        fetchProviderJobs(token);
        fetchProviderNotifications(token);
        sleep(1);

        // 3. Toggles availability (e.g., going on a break)
        toggleProviderAvailability(token, false);
        sleep(0.5);
        toggleProviderAvailability(token, true);

        // 4. Checks earnings
        fetchProviderEarnings(token);
    });

    sleep(1);
}
