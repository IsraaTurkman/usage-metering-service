# Usage Metering and Quota Service

A backend service for tracking API usage and managing quotas at both account and user levels.

I built this project using TypeScript, Express, PostgreSQL, and Drizzle ORM. The main idea is to allow applications to track how many units each user consumes and decide whether a request should be accepted or rejected based on the assigned quota plan.

## Features

- Account authentication using API keys
- Account and user-level quotas
- Predefined and custom plans
- Monthly usage tracking
- Maximum units allowed per request
- Usage consumption with accept/reject decisions
- Idempotency using request IDs
- Database transactions to handle concurrent requests
- Usage reports and request history
- Updating plans without restarting the service

## Tech Stack

- TypeScript / Node.js
- Express.js
- PostgreSQL
- Drizzle ORM
- Docker Compose
- Vitest

## Running the Project

**1. Clone the repository**

```bash
git clone <https://github.com/IsraaTurkman/usage-metering-service.git>
cd usage-metering-service
```

**2. Configure the environment**

Create a `.env` file based on `.env.example` and set the required values, especially `ADMIN_SETUP_KEY`.

**3. Start the services**

```bash
docker compose up -d --build
```

Docker Compose starts PostgreSQL, runs the database migrations and seed script, and starts the API server.

The API runs at `http://localhost:3000`.

To check that the server is running:

```bash
curl http://localhost:3000/health
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/accounts` | Create an account |
| PATCH | `/api/accounts/plan` | Change an account's plan |
| POST | `/api/users` | Create a user |
| GET | `/api/users` | List users |
| PATCH | `/api/users/:userId/plan` | Change a user's plan |
| GET | `/api/plans` | List available plans |
| POST | `/api/plans` | Create a custom plan |
| PATCH | `/api/plans/:planId` | Update a custom plan |
| POST | `/api/consume` | Consume usage units |
| GET | `/api/usage/account` | View account usage |
| GET | `/api/usage/users/:userId` | View user usage |
| GET | `/api/usage/history` | View usage history |

Most endpoints require an account API key.

## How Usage Consumption Works

When a consumption request is received, the service:

1. Authenticates the account.
2. Checks that the user belongs to the account.
3. Checks the account and user plans.
4. Verifies the request and monthly quota limits.
5. Accepts the request and updates usage, or rejects it without consuming units.

Usage is tracked by UTC month.

Requests with the same request ID are handled idempotently to avoid charging the same request twice.

I used database transactions and row locking to help prevent concurrent requests from exceeding the available quota.

## Predefined Plans

| Plan | Type | Monthly Allowance | Max Units / Request |
|---|---|---:|---:|
| Starter | Account | 1000 | 100 |
| Pro | Account | 10000 | 500 |
| Basic | User | 100 | 20 |
| Premium | User | 1000 | 100 |

Custom plans can also be created and updated through the API.

## Demo

The project includes a simple client in `client/demo.ts`.

It demonstrates accepted and rejected consumption requests, different user plans, and how updating a custom plan affects later requests.

After configuring the demo values in `.env`, run:

```bash
docker compose --profile demo run --rm --build client
```

The demo requires an existing account, two users, and a custom plan.

## Testing

To check TypeScript compilation:

```bash
npx tsc --noEmit
```

To run the automated tests:

```bash
npm test
```

I also added scripts to test concurrent consumption requests and basic API load.

The load test can be run using:

```bash
node --env-file=.env --import tsx scripts/load-test.ts
```

## Notes

- API keys are stored as hashes rather than plain text.
- The `.env` file is excluded from Git.
- Monthly usage is not reset when switching plans; the new limits apply to the existing usage.
- The project focuses on usage tracking and quota enforcement, not billing.



## Frontend Dashboard

The project includes a React and TypeScript dashboard that allows users to:

- Monitor monthly usage and remaining quotas.
- View registered users and available plans.
- Simulate usage requests.
- Review accepted and rejected requests.

### Running the Frontend

First, make sure the backend is running:

```bash
docker compose up -d --build
```

Then open a new terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Open the dashboard in your browser:

http://localhost:5173

Enter your account API key to connect to the dashboard.

The frontend communicates with the backend through the Vite development proxy.
