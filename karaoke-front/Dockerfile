FROM node:22-alpine

ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=$BACKEND_URL

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
