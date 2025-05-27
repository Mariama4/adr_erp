### ADR ERP

ADR ERP system

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app $URL_OF_THIS_REPO --branch develop
bench install-app adr_erp
```

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/adr_erp
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### License

mit

### Restart container

export APPS_JSON_BASE64=$(base64 -w 0 ../apps.json) && docker compose -p adr-frappe-project -f pwd.yml down --rmi all && docker build --no-cache  --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe   --build-arg=FRAPPE_BRANCH=version-15   --build-arg=PYTHON_VERSION=3.11.9   --build-arg=NODE_VERSION=18.20.2   --build-arg=APPS_JSON_BASE64=$APPS_JSON_BASE64   --tag=adr-frappe   --file=images/custom/Containerfile . && docker compose -p adr-frappe-project -f pwd.yml up -d && docker exec -it adr-frappe-project-backend-1 bash -c "bench migrate"