FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
RUN npm install jsonwebtoken bcryptjs
COPY server.js ./
COPY modules/ ./modules/
COPY routes/ ./routes/
COPY notifications-module/ ./notifications-module/
COPY lang/ ./lang/
COPY index.html owner.html worker.html client.html ./
COPY tg-worker.html tg-client.html sql-setup.html ./
COPY manifest.json sw.js push-client.js ./
COPY bot-knowledge.md ./
RUN mkdir -p /app/data /app/receipts
RUN chown -R node:node /app/data /app/receipts
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('http').get('http://localhost:8080/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
EXPOSE 8080
CMD ["node", "server.js"]
