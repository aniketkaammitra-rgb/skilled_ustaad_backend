// Mock Firebase Admin before any imports
jest.mock("firebase-admin", () => ({
  initializeApp: jest.fn(),
  apps: [],
  credential: {
    cert: jest.fn()
  }
}));

jest.mock("../../models/Message.js");
jest.mock("../../models/Booking.js");
jest.mock("../../models/UserNotification.js");
jest.mock("../../models/ProviderNotification.js");
jest.mock("../../libs/socket.js");
jest.mock("../../libs/logger.js", () => ({
  warn: jest.fn(),
  error: jest.fn(),
}));

import { sendMessage } from "../../controllers/chat.controller.js";
import Message from "../../models/Message.js";
import Booking from "../../models/Booking.js";
import UserNotification from "../../models/UserNotification.js";
import { getIO } from "../../libs/socket.js";


describe("Chat Controller - sendMessage", () => {
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock Express Request and Response
    req = {
      body: {
        bookingId: "book123",
        receiverId: "user456",
        content: "Hello!",
        tempId: "temp_001"
      },
      user: {
        sub: "sender789",
        role: "provider",
        name: "Expert John"
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    // Mock Socket.io getIO implementation
    getIO.mockReturnValue({
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    });
  });

  test("should return 400 if required fields are missing", async () => {
    req.body.content = ""; // Missing content

    await sendMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "Missing required fields"
    }));
  });

  test("should successfully send a message and broadcast via Socket.io", async () => {
    // 1. Setup Mock Returns
    const mockMessage = {
      _id: "msg_abc",
      bookingId: "book123",
      content: "Hello!",
      toJSON: () => ({ _id: "msg_abc", content: "Hello!" })
    };
    Message.create.mockResolvedValue(mockMessage);

    // 2. Execute
    await sendMessage(req, res);

    // 3. Assertions
    expect(Message.create).toHaveBeenCalledWith(expect.objectContaining({
      senderId: "sender789",
      content: "Hello!"
    }));

    // Check if Socket.io broadcast was called
    const io = getIO();
    expect(io.to).toHaveBeenCalledWith("booking_book123");
    expect(io.emit).toHaveBeenCalledWith("new_message", expect.any(Object));

    // Check if Response is 201
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(mockMessage);
  });

  test("should auto-resolve receiverId from booking if not provided", async () => {
    req.body.receiverId = null; // simulate missing receiverId
    req.user.role = "user"; // sender is user

    // Mock Booking find to return a providerId
    Booking.findById.mockResolvedValue({
      providerId: "resolved_provider_456"
    });

    Message.create.mockResolvedValue({ toJSON: () => ({}) });

    await sendMessage(req, res);

    expect(Booking.findById).toHaveBeenCalledWith("book123");
    expect(Message.create).toHaveBeenCalledWith(expect.objectContaining({
      receiverId: "resolved_provider_456"
    }));
  });
});