#!/bin/bash

# Title: Ceramic ERP Launcher (Linux)
echo "==========================================="
echo "  Starting Ceramic ERP System (Linux)"
echo "==========================================="

echo ""
echo "0. Setting working directory..."
# Navigate to the script's directory to ensure relative paths work
cd "$(dirname "$0")"

echo "1. Stopping existing Application processes..."
# Force kill processes on our ports
fuser -k -9 5000/tcp > /dev/null 2>&1
fuser -k -9 3000/tcp > /dev/null 2>&1

# Wait for ports to actually be free (max 10 seconds)
echo "Ensuring ports are clear..."
for i in {1..10}; do
    if ! fuser 5000/tcp > /dev/null 2>&1 && ! fuser 3000/tcp > /dev/null 2>&1; then
        echo "Ports cleared."
        break
    fi
    sleep 1
done

echo ""
echo "2. Starting Backend Server..."
# Navigate to backend and run dev, logging to file
cd backend
npm run dev > ../backend_log.txt 2>&1 &
BACKEND_PID=$!
cd ..

echo "Waiting for backend to initialize (5s)..."
sleep 5

echo ""
echo "3. Starting Frontend Server..."
# Navigate to frontend and run dev, logging to file
cd frontend
npm run dev > ../frontend_log.txt 2>&1 &
FRONTEND_PID=$!
cd ..

echo "Waiting for frontend to be ready (10s)..."
sleep 10

echo ""
echo "4. Launching Browser..."
# Open default browser
xdg-open "http://localhost:3000" || \
sensible-browser "http://localhost:3000" || \
firefox "http://localhost:3000" || \
google-chrome "http://localhost:3000"

echo ""
echo "==========================================="
echo "  Application is running in BACKGROUND!"
echo "  Backend PID: $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo "==========================================="
echo "You won't see this window in the future."

# Wait for background processes to finish (which they won't until killed)
wait $BACKEND_PID $FRONTEND_PID
