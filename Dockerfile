FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY server.js ./
COPY modules/ ./modules/
RUN npm install jsonwebtoken bcryptjs
COPY index.html owner.html worker.html client.html ./
COPY manifest.json sw.js push-client.js ./
COPY bot-knowledge.md ./
RUN mkdir -p /app/data /app/receipts
EXPOSE 8080
CMD ["node", "server.js"]
