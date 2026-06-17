# Regulatory Classifier Prompt

Task: classify user intent and detect blocked categories before comparison.

Output JSON:

```json
{
  "category": "banking|investment_forbidden|unknown",
  "blocked": false,
  "reason": "string",
  "entities": []
}
```

Blocked intents must include categories:

- personalized investment advice
- stocks
- ETFs
- investment funds
- bonds
- structured deposits
- cryptoassets
- insurance

Allowed:

- bank account
- remunerated account
- payroll account
- bank deposit
