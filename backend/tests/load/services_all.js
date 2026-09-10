import { sleep, group } from 'k6';
import { fetchServices, fetchServiceById } from './api_helpers.js';

export const options = {
    scenarios: {
        services_discovery_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 discovery interactions per second
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
    const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Placeholder
    const serviceId = '69aab0eab6c562545f51d540'; // Placeholder

    group('Service Discovery Lifecycle', function () {
        // 1. Fetch category list (general search)
        fetchServices(userToken, 'Patna', 'cook');
        sleep(0.5);

        // 2. View specific service details
        fetchServiceById(userToken, serviceId);
    });

    sleep(1);
}
