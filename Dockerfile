# Build lightweight runtime image for the Claims AI Agent
FROM node:20-slim AS deps

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production

FROM node:20-slim AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
