# Private operator setup

The public Pages build and the standalone file use synthetic data. The operator application runs as a separate service on the food bank operator’s computer. It can read one Agentboxd Homingbox inbox. Node.js 24 or newer is required.

## Select the inbox and key

1. Sign in to Agentboxd, choose your workspace and create or select a dedicated Homingbox inbox using the dashboard. Copy its inbox ID and email address. Use a synthetic donor and test food descriptions for a demonstration.
2. In **API keys**, select **one inbox**, choose that inbox and select exactly **inboxes:read** and **messages:read** in the individual permissions list. The general read-only preset includes other permissions. Creating the inbox and creating the key are operator setup tasks.
3. In the project directory copy `.env.example` to `.env.local`, restrict its permissions and enter the key and inbox ID in a local editor. Leave the base URL unset to use `https://api.agentboxd.com`. Keep the key on the operator machine. [Quickstart](https://agentboxd.com/docs/quickstart) · [API scope and permissions](https://agentboxd.com/docs/api)

```sh
cp .env.example .env.local
chmod 600 .env.local
npm ci
npm run build:operator
npm run operator
```

The server listens on `http://127.0.0.1:4314`. Open the local sign-in URL from the private `operator-link.txt` file identified by the server. It pairs the browser with the local operator process. Keep that file on the machine. On restart, open the current link in the same browser profile. Use the same port and browser for the inventory ledger. The inbox reports **Unconfigured** if either provider setting is missing. Before the first provider contact it has no verified connection. A successful **Sync Inbox** checks the configured inbox and reads inbound messages. An error displays its current status.

`NOKITCHEN_DATA_DIR` overrides the default staging directory (`~/.nokitchen/operator`), and `NOKITCHEN_PORT` overrides the local port. Back up the operator browser profile and the private staging directory together. A different browser profile has a separate inventory ledger. Claims in the staging database protect previously imported messages from another profile.

## From email to dinner

1. With the model week open, approve the initial allocation to establish an approved baseline. From your own email client send a test email to **your dedicated inbox**. Use the subject *Food donation available*. A reproducible example body is below. These dates refer to the synthetic model week starting 23 November 2026.
2. In the private bank portal, open **Donations → Sync Inbox**. Find the message by its sender, subject and timestamp. Choose **Review Donation** and inspect the original text and extracted fields.
3. Confirm the actual label and package details. For the example, check the ambient sealed pouch, refrigeration after opening and the Monday-to-Sunday planning window against the supplied demonstration facts. Resolve every unknown or exclude the line with a reason. Save edits, mark reviewed and preview the offer.
4. At physical receipt, enter **8** sealed pouches for a short delivery and use the package total of **1,600 g**. Confirm the delivery difference, then select **Confirm received**. Only this step adds stock. Recalculate and compare the draft with the approval.
5. In the receipt impact, choose **Household 02** and inspect the **Friday collection box** and its chickpea trace. Follow the day and meal to the household recipe, preparation method, ingredients and required equipment. Ordinary **Approve plan** commits replacement reservations. For the full-delivery example, use a fresh synthetic workspace and a second independently sent test message.
6. The suggested reply uses the verified local offer or receipt. **Copy Reply** puts the draft on the clipboard for operator review. NoKitchen has no send permission.

```text
12 sealed pouches of ready-to-eat chickpeas, 200 g edible contents each. Delivery 2026-11-23. Best before 2026-12-15.
```

The local parser supports a limited English/Czech vocabulary. Relative dates, missing weights, ambiguous food names and uncertain storage stay open for human review. Attachment names are informational. Put the test donation in the message body. [Security and data handling](agentboxd-security.md)
