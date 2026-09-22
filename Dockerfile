FROM node:20-slim

# openssl is required by Prisma's query engine on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install

# Generate the Prisma client at build time.
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000
CMD ["node", "src/server.js"]
