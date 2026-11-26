FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# Uploaded PDFs live in a volume shared with the AI service.
RUN mkdir -p /data/uploads && chown node:node /data/uploads
USER node

EXPOSE 5000
CMD ["node", "src/server.js"]
