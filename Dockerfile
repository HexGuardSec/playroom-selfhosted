FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tzdata
COPY package.json server.js ./
COPY src ./src
COPY public ./public
# The app runs as the unprivileged "node" user
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 8080
HEALTHCHECK --interval=1m --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "server.js"]
