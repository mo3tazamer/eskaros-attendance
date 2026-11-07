# بوابة الموظفين — صورة إنتاج (Node + pg للـ Postgres)
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY public ./public

# مع Postgres (DATABASE_URL) لا يلزم قرص دائم؛ النصوص التالية للوضع المحلي فقط.
ENV HOST=0.0.0.0
ENV PORT=10000
EXPOSE 10000

USER node
CMD ["node", "server/index.js"]
