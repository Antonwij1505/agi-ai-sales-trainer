# ---- Build stage ----
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg for audio normalisation (Android sends AMR/3GP/OPUS; STT wants WAV).
# python3 + edge-tts for the TTS provider (free Indonesian voices, no API key).
RUN apk add --no-cache ffmpeg python3 py3-pip \
    && pip3 install --no-cache-dir --break-system-packages edge-tts

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY migrations ./migrations

EXPOSE 4100
CMD ["node", "dist/server.js"]
