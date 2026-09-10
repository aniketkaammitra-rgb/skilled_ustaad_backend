FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./

# Install dependencies (only production dependencies can be installed using npm ci --omit=dev, but keeping it simple for now)
RUN npm ci

# Copy all application source code
COPY . .

# Expose the port the app runs on (usually 5000 based on common patterns, check your env)
EXPOSE 5000

# Start the application
CMD ["npm", "start"]
