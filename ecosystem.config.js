module.exports = {
  "apps": [
    {
      "name": "cortextos-daemon",
      "script": "/Users/mariosmacstudio/cortextos/dist/daemon.js",
      "args": "--instance default",
      "cwd": "/Users/mariosmacstudio/cortextos",
      "env": {
        "CTX_INSTANCE_ID": "default",
        "CTX_ROOT": "/Users/mariosmacstudio/.cortextos/default",
        "CTX_FRAMEWORK_ROOT": "/Users/mariosmacstudio/cortextos",
        "CTX_PROJECT_ROOT": "/Users/mariosmacstudio/cortextos",
        "CTX_ORG": "unikprompt",
        "CTX_DEBUG_ALLOW_CRASH_TRIGGER": "0"
      },
      "max_restarts": 10,
      "restart_delay": 5000,
      "autorestart": true
    }
  ]
};
