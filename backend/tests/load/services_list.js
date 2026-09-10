import { sleep } from 'k6';
import { fetchServices } from './api_helpers.js';

export const options = {
    vus: 100,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<300'], // Services should be fast
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    fetchServices();
    sleep(1);
}
