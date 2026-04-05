@echo off
cd backend
start /B npm run dev
cd ..
cd frontend
start /B npm run dev
