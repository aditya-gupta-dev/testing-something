FROM oven/bun:1-alpine as base
WORKDIR /app

# Copy the app files
COPY . .

# If you have dependencies, you can uncomment the following line
# RUN bun install

EXPOSE 3000

CMD ["bun", "run", "index.ts"]
