import { sleep, group } from 'k6';
import { 
    requestUserOTP, 
    verifyUserOTP, 
    fetchProviderProfile, 
    updateProfile, 
    requestDeactivateAccount,
    logoutUser 
} from './api_helpers.js';

export const options = {
    scenarios: {
        auth_comprehensive_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 auth lifecycles per second
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
    const phoneNumber = `99999${Math.floor(Math.random() * 90000 + 10000)}`;
    const mockOTP = '123456';

    group('Comprehensive Auth Lifecycle', function () {
        // 1. Request OTP (Register/Login)
        requestUserOTP(phoneNumber);
        sleep(0.5);

        // 2. Verify OTP (Session Creation)
        const verifyRes = verifyUserOTP(phoneNumber, mockOTP);
        const token = verifyRes.json('token');
        sleep(0.5);

        if (token) {
            // 3. View Profile
            fetchProviderProfile(token);
            sleep(0.5);

            // 4. Update Profile
            updateProfile(token, { fullName: 'Updated Name' });
            sleep(0.5);

            // 5. Request Deactivation (Optional path simulation)
            requestDeactivateAccount(token);
            sleep(0.5);

            // 6. Logout
            logoutUser();
        }
    });

    sleep(1);
}
