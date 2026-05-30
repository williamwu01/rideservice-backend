FROM node:22-slim

WORKDIR /app

# Prisma requires openssl at runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install deps (includes devDependencies needed for build: prisma CLI, tsc)
COPY package*.json ./
RUN npm ci

# Copy source and build (prisma generate + tsc)
COPY . .
RUN npm run build

CMD ["npm", "run", "start"]
