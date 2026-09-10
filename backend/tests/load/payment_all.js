import { sleep, group } from 'k6';
import { createTokenOrder, verifyTokenPayment, createFullPayment, verifyFullPayment } from './api_helpers.js';

export const options = {
    scenarios: {
        payment_load_sim: {
            executor: 'constant-arrival-rate',
            rate: 100, // 100 payment flows per second
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
    const bookingId = '69bbc75f1902feb6f6e2c4d5'; // Placeholder
    const mockOrderId = 'order_mock_test';
    const mockPaymentId = 'pay_mock_test';
    const mockSignature = 'mock_signature';

    group('Payment Lifecycle', function () {
        // 1. Create and verify Token Payment
        createTokenOrder(userToken, bookingId);
        sleep(0.5);
        verifyTokenPayment(userToken, mockOrderId, mockPaymentId, mockSignature);
        
        sleep(1);

        // 2. Create and verify Full Payment
        createFullPayment(userToken, bookingId);
        sleep(0.5);
        verifyFullPayment(userToken, mockOrderId, mockPaymentId, mockSignature);
    });

    sleep(1);
}
