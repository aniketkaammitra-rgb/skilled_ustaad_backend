import { sleep } from 'k6';
import { requestUserOTP } from './api_helpers.js';

export const options = {
    vus: 50,
    duration: '30s',
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    requestUserOTP('+911234567890');
    sleep(1);
}
