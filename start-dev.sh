#!/bin/bash
# Persistent dev server launcher — fully detaches from controlling terminal
cd /home/z/my-project
pkill -f "next dev" 2>/dev/null
sleep 1
# Use nohup + setsid + full fd redirection to survive parent shell exit
nohup setsid ./node_modules/.bin/next dev -p 3000 > /home/z/my-project/dev.log 2>&1 < /dev/null &
echo $! > /home/z/my-project/dev.pid
disown
echo "Dev server launched, PID $(cat /home/z/my-project/dev.pid)"
