#!/bin/bash

# Port base of the stack to test: 3000 (Node 20), 3010 (22), 3020 (24), 3030 (26)
BASE=${PORT_BASE:-3000}

echo "Testing Mock Service..."
curl -s http://localhost:$((BASE + 1))/api/data | jq .

echo -e "\n\nTesting NestJS Fastify+Axios HTTP Module..."
time curl -s http://localhost:$((BASE + 2))/api | jq '.message, .duration'

echo -e "\n\nTesting NestJS Fastify+Undici HTTP Module..."
time curl -s http://localhost:$((BASE + 3))/api | jq '.message, .duration'

echo -e "\n\nTesting NestJS Express+Axios HTTP Module..."
time curl -s http://localhost:$((BASE + 4))/api | jq '.message, .duration'

echo -e "\n\nRunning 10 concurrent requests to Fastify+Axios HTTP..."
time seq 1 10 | xargs -P 10 -I {} curl -s http://localhost:$((BASE + 2))/api -o /dev/null

echo -e "\n\nRunning 10 concurrent requests to Fastify+Undici HTTP..."
time seq 1 10 | xargs -P 10 -I {} curl -s http://localhost:$((BASE + 3))/api -o /dev/null

echo -e "\n\nRunning 10 concurrent requests to Express+Axios HTTP..."
time seq 1 10 | xargs -P 10 -I {} curl -s http://localhost:$((BASE + 4))/api -o /dev/null