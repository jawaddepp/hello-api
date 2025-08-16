FROM node:20-alpine

# create app dir
WORKDIR /app

# install deps (lockfile optional)
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# copy app
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# start the app
CMD ["npm","start"]
