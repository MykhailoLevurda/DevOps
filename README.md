# Mini E-Shop — Semestrální práce (TDD + DevOps)

REST API mini e-shopu implementované v NestJS s důrazem na TDD/BDD/ATDD metodologii a kompletní DevOps workflow.

---

## Obsah

1. [Popis domény](#1-popis-domény)
2. [Business pravidla](#2-business-pravidla)
3. [Architektura](#3-architektura)
4. [REST API](#4-rest-api)
5. [Jak spustit lokálně](#5-jak-spustit-lokálně)
6. [Testovací strategie](#6-testovací-strategie)
7. [CI/CD pipeline](#7-cicd-pipeline)
8. [Kontejnerizace](#8-kontejnerizace)
9. [Kubernetes](#9-kubernetes)
10. [Správa secrets](#10-správa-secrets)
11. [TDD proces](#11-tdd-proces)

---

## 1. Popis domény

Aplikace simuluje mini e-shop s uživateli, produkty a objednávkami. Zákazníci mohou procházet produkty a vytvářet objednávky. Administrátoři spravují produkty a stav objednávek.

**Doménové entity:**

| Entita | Popis |
|--------|-------|
| `User` | Registrovaný uživatel s rolí ADMIN nebo CUSTOMER |
| `Product` | Produkt s názvem, popisem, cenou a počtem kusů na skladě |
| `Order` | Objednávka uživatele s celkovou cenou a stavem |
| `OrderItem` | Položka objednávky — produkt, množství, cena v okamžiku objednání |

**Vztahy:**
- `User` 1:N `Order`
- `Order` 1:N `OrderItem`
- `Product` 1:N `OrderItem`

---

## 2. Business pravidla

Aplikace implementuje 6 netriviálních business pravidel:

| # | Pravidlo | HTTP kód |
|---|---------|----------|
| 1 | **Prázdná objednávka** — nelze vytvořit objednávku bez položek | 400 |
| 2 | **Kontrola skladu** — při vytvoření objednávky musí být dostatek zboží na skladě | 422 |
| 3 | **Price snapshot** — cena produktu je uzamčena v `unitPrice` při vytvoření objednávky; pozdější změna ceny existující objednávky neovlivní | — |
| 4 | **Stavový automat** — objednávka prochází stavy PENDING → PAID → SHIPPED → DELIVERED; PENDING/PAID lze zrušit (CANCELLED); SHIPPED a DELIVERED zrušit nelze | 422 |
| 5 | **Idempotence** — pokus o opakované zaplacení již zaplacené objednávky vrací chybu | 409 |
| 6 | **Omezení rolí** — pouze ADMIN může vytvářet/upravovat/mazat produkty a měnit stav objednávek | 403 |

---

## 3. Architektura

### Diagram komponent

```
┌─────────────────────────────────────────────────────┐
│                    HTTP klient                       │
│         (Supertest / curl / frontend)                │
└───────────────────────┬─────────────────────────────┘
                        │ REST (HTTP)
┌───────────────────────▼─────────────────────────────┐
│                   NestJS API                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │    Guards   │  │  Controllers │  │   Filters   │ │
│  │ (RolesGuard)│  │ /users       │  │ (HttpExcep- │ │
│  └─────────────┘  │ /products    │  │  tionFilter)│ │
│                   │ /orders      │  └─────────────┘ │
│                   └──────┬───────┘                  │
│                          │                          │
│                   ┌──────▼───────┐                  │
│                   │   Services   │                  │
│                   │ UsersService │                  │
│                   │ ProductsServ.│                  │
│                   │ OrdersServ.  │                  │
│                   └──────┬───────┘                  │
│                          │ TypeORM                  │
│                   ┌──────▼───────┐                  │
│                   │ Repositories │                  │
│                   └──────┬───────┘                  │
└──────────────────────────┼──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│                  PostgreSQL 16                        │
│   users / products / orders / order_items            │
└──────────────────────────────────────────────────────┘
```

### Vrstvy aplikace

- **Controllers** — zpracování HTTP požadavků, čtení hlaviček `X-User-Id` a `X-User-Role`
- **Guards** — `RolesGuard` ověřuje oprávnění před každým požadavkem
- **Services** — business logika, validace pravidel, transakce
- **Entities** — TypeORM entity mapující databázové tabulky
- **DTOs** — validační objekty vstupních dat (`class-validator`)
- **Filters** — jednotný formát chybových odpovědí

### Autentizace

Autentizace je zjednodušena na hlavičky `X-User-Id` a `X-User-Role` (bez JWT). Toto zjednodušení je záměrné — projekt demonstruje TDD a DevOps procesy, nikoli implementaci auth systému.

---

## 4. REST API

| Metoda | Cesta | Role | Popis |
|--------|-------|------|-------|
| POST | `/users` | — | Registrace uživatele |
| GET | `/users` | ADMIN | Seznam všech uživatelů |
| GET | `/users/:id` | — | Detail uživatele |
| PATCH | `/users/:id` | — | Aktualizace uživatele |
| DELETE | `/users/:id` | ADMIN | Smazání uživatele |
| POST | `/products` | ADMIN | Vytvoření produktu |
| GET | `/products` | — | Seznam produktů |
| GET | `/products/:id` | — | Detail produktu |
| PATCH | `/products/:id` | ADMIN | Aktualizace produktu |
| DELETE | `/products/:id` | ADMIN | Smazání produktu |
| POST | `/orders` | CUSTOMER | Vytvoření objednávky |
| GET | `/orders` | ADMIN=vše, CUSTOMER=vlastní | Seznam objednávek |
| GET | `/orders/:id` | vlastník nebo ADMIN | Detail objednávky |
| PATCH | `/orders/:id/status` | ADMIN | Změna stavu objednávky |
| DELETE | `/orders/:id` | vlastník (PENDING) nebo ADMIN | Smazání objednávky |

**Příklady požadavků:**

```bash
# Vytvoření uživatele
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"email":"zakaznik@example.com","password":"heslo123"}'

# Vytvoření produktu (jako ADMIN)
curl -X POST http://localhost:3000/products \
  -H "X-User-Role: admin" \
  -H "Content-Type: application/json" \
  -d '{"name":"Widget","price":25.00,"stockQuantity":100}'

# Vytvoření objednávky
curl -X POST http://localhost:3000/orders \
  -H "X-User-Id: <user-id>" \
  -H "X-User-Role: customer" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"productId":"<product-id>","quantity":2}]}'
```

---

## 5. Jak spustit lokálně

### Požadavky

- Node.js 20+
- Docker + Docker Compose
- npm

### Instalace

```bash
git clone https://github.com/MykhailoLevurda/DevOps.git
cd DevOps
npm install
```

### Konfigurace prostředí

```bash
cp .env.example .env
# upravit hodnoty v .env dle potřeby
```

### Spuštění aplikace

```bash
# Spuštění aplikace + databáze přes Docker Compose
docker compose up --build

# Aplikace běží na http://localhost:3000
curl http://localhost:3000/products
```

### Spuštění unit testů

```bash
npm run test
```

### Spuštění testů s pokrytím

```bash
npm run test:cov
```

### Spuštění e2e testů

```bash
# 1. Spustit testovací databázi
docker compose -f docker-compose.test.yml up -d

# 2. Spustit e2e testy
V powershellu
$env:DB_HOST="localhost"; $env:DB_PORT="5433"; $env:DB_USER="eshop"; $env:DB_PASSWORD="eshop"; $env:DB_NAME="eshop_test"; $env:NODE_ENV="test"; npm run test:e2e
V Git Bashi
DB_HOST=localhost DB_PORT=5433 DB_USER=eshop DB_PASSWORD=eshop DB_NAME=eshop_test NODE_ENV=test npm run test:e2e
```

---

## 6. Testovací strategie

### Přehled testů

| Typ | Soubory | Počet testů | Co testuje |
|-----|---------|------------|------------|
| Unit | `*.service.spec.ts`, `*.controller.spec.ts`, `*.guard.spec.ts`, `*.filter.spec.ts` | 34 | Business pravidla izolovaně |
| E2E | `test/app.e2e-spec.ts` | 15 | Kompletní HTTP stack s reálnou DB |

### Unit testy

Unit testy izolují business logiku pomocí mock objektů (TypeORM repository, DataSource). Jsou psány podle principů **FIRST** (Fast, Isolated, Repeatable, Self-validating, Timely) a struktury **AAA** (Arrange, Act, Assert).

**Co se mockuje:**
- TypeORM Repository (`findOne`, `find`, `save`, `delete`, `create`)
- `DataSource.transaction()` — pro testování atomických operací bez skutečné DB
- `ProductsService.decrementStock` — v testech `OrdersService`

**Příklad struktury testu (AAA):**
```typescript
it('should throw ConflictException when email already exists', async () => {
  // Arrange
  mockUserRepository.findOne.mockResolvedValue({ id: 'existing-id' });

  // Act & Assert
  await expect(service.create({ email: 'dup@example.com', password: 'test' }))
    .rejects.toThrow(ConflictException);
});
```

**Pokrytá business pravidla v unit testech:**
- `orders.service.spec.ts` (16 testů): prázdná objednávka, kontrola skladu, price snapshot, výpočet totalPrice, všechny přechody stavového automatu, idempotence platby, omezení rolí, dekrementace skladu po platbě

### E2E / Integrační testy

E2E testy používají reálnou PostgreSQL databázi (port 5433) a testují celý HTTP stack pomocí **Supertest**. Po každém testu se tabulky truncují pro izolaci.

**Pořadí truncate:** `order_items → orders → products → users` (respektuje FK závislosti)

**Pokrytá scénáře:**
- Registrace uživatele a detekce duplikátního emailu (409)
- Autorizace — ADMIN vs CUSTOMER (403)
- Vytvoření objednávky se správným `totalPrice`
- Prázdná objednávka → 400
- Nedostatečný sklad → 422
- Dekrementace skladu po změně stavu na PAID
- Idempotence — druhá platba → 409
- Nelze zrušit odeslanou objednávku → 422
- Price snapshot — změna ceny neovlivní existující objednávku

### Cíle pokrytí

```
Lines:    >= 70 %
Branches: >= 50 %
```

Vyloučeno z měření: `*.module.ts`, `main.ts` (konfigurační a bootstrap kód bez logiky).

---

## 7. CI/CD pipeline

Pipeline je definována v [.github/workflows/ci-cd.yml](.github/workflows/ci-cd.yml) a spouští se při každém push na větve `main` a `feature/**`.

### Fáze pipeline

```
push / PR
    |
    v
+-----------------------------+
|  Stage 1: build-and-test   |  (vsechny vetve)
|  - npm ci                  |
|  - npm run build           |
|  - npm run lint            |
|  - npm run test:cov        |  -> artefakt: coverage report
|  - npm run test:e2e        |
+-------------+---------------+
              | (pouze main)
              v
+-----------------------------+
|  Stage 2: docker-build-push |
|  - docker build             |
|  - push do ghcr.io          |
|    devops:sha-<commit>       |
|    devops:latest             |
+-------------+---------------+
              |
              v
+-----------------------------+
|  Stage 3: deploy-staging    |
|  - minikube setup           |
|  - kubectl apply k8s/       |
|  - rollout status check     |
|  - smoke test (curl)        |
+-------------+---------------+
              | (manualni schvaleni)
              v
+-----------------------------+
|  Stage 4: deploy-production |
|  - environment: production  |
|  - kubectl apply k8s/       |
|  - rollout status check     |
+-----------------------------+
```

### Prostředí

| Prostředí | Namespace | Repliky | DB název | Trigger |
|-----------|-----------|---------|---------|---------|
| Staging | `staging` | 1 | `eshop_staging` | automaticky při push na main |
| Production | `production` | 2 | `eshop_production` | manuální schválení |

**Rozdíly konfigurace staging vs. production:**
- Production má 2 repliky (vyšší dostupnost)
- Production má vyšší resource limity (CPU/paměť)
- `NODE_ENV` je nastaven na `staging` resp. `production`
- Databáze jsou oddělené (různé názvy DB v ConfigMap)

---

## 8. Kontejnerizace

### Dockerfile

Dockerfile používá **multi-stage build** pro minimální výsledný image:

```
Stage 1 (builder):
  - node:20-alpine
  - instalace vsech zavislosti (vcetne devDependencies)
  - nest build -> /app/dist

Stage 2 (production):
  - node:20-alpine (cisty)
  - pouze produkcni zavislosti (npm ci --only=production)
  - zkopirovani dist/ z builderu
  - USER node (ne-root)
  - HEALTHCHECK pres wget
```

### Docker Compose

**`docker-compose.yml`** — lokální vývoj:
- `api` — NestJS aplikace na portu 3000
- `db` — PostgreSQL 16 na portu 5432
- healthcheck na databázi před startem API

**`docker-compose.test.yml`** — izolované e2e testy:
- `db-test` — PostgreSQL 16 na portu 5433
- tmpfs storage (ephemeral, rychlé mazání mezi testy)

---

## 9. Kubernetes

Manifesty jsou v adresáři [k8s/](k8s/).

### Struktura manifestů

| Soubor | Popis |
|--------|-------|
| `namespace.yml` | Namespacesy `staging` a `production` |
| `configmap.yml` | Konfigurace prostředí (DB_HOST, DB_NAME, NODE_ENV) |
| `secret.yml` | Citlivé údaje (DB_USER, DB_PASSWORD) — base64 enkódováno |
| `postgres-pvc.yml` | PersistentVolumeClaim pro PostgreSQL (1Gi staging, 5Gi prod) |
| `postgres-deployment.yml` | PostgreSQL 16 Deployment pro obě prostředí |
| `postgres-service.yml` | ClusterIP Service `postgres-svc` (port 5432) |
| `deployment.yml` | NestJS API Deployment (1 replika staging, 2 production) |
| `service.yml` | ClusterIP Service pro API (port 3000) |
| `ingress.yml` | Ingress — `staging.mini-eshop.local` a `mini-eshop.local` |

### Lokální nasazení (minikube)

```bash
# Spuštění minikube
minikube start

# Aplikování manifestů
kubectl apply -f k8s/namespace.yml
kubectl apply -f k8s/configmap.yml
kubectl apply -f k8s/secret.yml
kubectl apply -f k8s/postgres-pvc.yml
kubectl apply -f k8s/postgres-deployment.yml
kubectl apply -f k8s/postgres-service.yml
kubectl apply -f k8s/deployment.yml
kubectl apply -f k8s/service.yml
kubectl apply -f k8s/ingress.yml

# Ověření stavu
kubectl rollout status deployment/postgres -n staging
kubectl rollout status deployment/mini-eshop -n staging

# Přístup přes port-forward
kubectl port-forward svc/mini-eshop 3000:3000 -n staging
curl http://localhost:3000/products
```

### Resource limity

| Komponenta | Prostředí | CPU request | CPU limit | RAM request | RAM limit |
|------------|-----------|-------------|-----------|-------------|-----------|
| API | Staging | 100m | 250m | 128Mi | 256Mi |
| API | Production | 200m | 500m | 256Mi | 512Mi |
| PostgreSQL | Staging | 100m | 250m | 256Mi | 512Mi |
| PostgreSQL | Production | 200m | 500m | 512Mi | 1Gi |

---

## 10. Správa secrets

**V repozitáři jsou secrets uloženy jako base64 enkódované hodnoty v `k8s/secret.yml`.** Toto je demonstrační řešení — v produkčním prostředí by se použilo:
- Kubernetes External Secrets Operator + HashiCorp Vault
- nebo GitHub Actions secrets + kubectl apply v CI

**CI secrets** (`GITHUB_TOKEN`) jsou uloženy v GitHub Actions secrets a používají se pro push Docker image do GHCR. V kódu ani v repozitáři se nevyskytují plaintext tokeny.

---

## 11. TDD proces

Projekt byl vyvíjen striktně metodou **Red -> Green -> Refactor**:

1. **RED** — nejprve napsány failing testy (commit `test(*): ...`)
2. **GREEN** — minimální implementace pro splnění testů (commit `feat(*): ...`)
3. **REFACTOR** — vyčištění kódu bez změny chování

CI pipeline byla spuštěna po každém commitu — failing testy jsou doloženy v historii GitHub Actions.

### Pořadí vývoje modulů

```
feature/users -> feature/products -> feature/orders -> feature/testy
     |                 |                  |                |
  RED+GREEN         RED+GREEN          RED+GREEN       e2e testy
```

### Technický stack

| Vrstva | Technologie |
|--------|-------------|
| Backend | NestJS (TypeScript) |
| Databáze | PostgreSQL 16 + TypeORM |
| Unit testy | Jest + mock objekty |
| E2E testy | Jest + Supertest + reálná PostgreSQL |
| Coverage | Istanbul (Jest) — min. 70 % lines, 50 % branches |
| CI/CD | GitHub Actions |
| Kontejnery | Docker + Docker Compose |
| Orchestrace | Kubernetes (minikube) |
| Registry | GitHub Container Registry (ghcr.io) |
