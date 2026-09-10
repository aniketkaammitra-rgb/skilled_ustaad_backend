import { sleep } from 'k6';
import { fetchProviderJobs } from './api_helpers.js';

export const options = {
    vus: 50,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const dummyToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; 
    fetchProviderJobs(dummyToken);
    sleep(1);
}
