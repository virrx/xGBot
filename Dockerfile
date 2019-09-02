FROM node:10

WORKDIR /app
COPY package*.json ./

RUN npm ci
COPY index.js ./

CMD [ "npm", "start" ]
