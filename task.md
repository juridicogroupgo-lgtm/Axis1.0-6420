# GoFintech Proposal Flow Fix

## Status: FLOW VERIFIED ✅

### What was fixed
1. **3 new PATCH functions** in `gofintech.ts`:
   - `atualizarPessoais`, `atualizarEndereco`, `atualizarBancario`
   - Each now injects `operacao_uuid` into request body (required by GF API)
   
2. **`proposals.ts` /submit** handler now runs 4-step flow after `criarOperacao`:
   - Step 1: PATCH /pessoais (nome, nascimento, sexo, rg, filiacao_mae)
   - Step 2: PATCH /endereco (cep, logradouro, numero, cidade, uf)
   - Step 3: PATCH /bancario (tipo, cod, agencia, conta, titular)
   - Step 4: POST /operacoes/{uuid}/implantar

3. **`tipoConta` normalization**: "corrente" → "Corrente", "poupanca" → "Poupança"

4. **GF_FALLBACK_TOKEN** in .env updated with fresh token (valid ~1h)

### Verified manually (proposal b4c20ee7)
- All 3 PATCH endpoints accept `operacao_uuid` in body ✅
- Data saved in GF: RG, CEP, bancário all populated ✅  
- `implantar` fires and moves to ENVIADA ✅
- FALHA ENVIO = expected (fake test bank account) ✅

### Remaining issues

1. **[HIGH] GF /auth/login rate limit** — limit is 1 req per window, retries burn it.
   - Currently using fallback token (expires hourly). 
   - Fix: reduce retry count from 3→1, add longer delay before retry.

2. **[HIGH] Duplicate proposal path doesn't run 4-step flow**
   - When CPF already has a proposal, we return early before pessoais/endereco/bancario
   - Should also patch data + implantar for duplicates if status is INICIADA/EM DIGITAÇÃO

3. **[MEDIUM] Form missing RG fields**: `orgao_emissor`, `uf_documento`, `data_emissao`
   - `nova-proposta.tsx` needs these fields added

4. **[MEDIUM] signatureUrl timing**: Should only show after implantar succeeds
   - Currently shows gerarTermoCltOperacao URL from right after criarOperacao

5. **[LOW] bancario_nome missing**: We don't look up bank name from code
   - GF accepts it — would be nice to map bancario_cod → bank name

### Key GF API facts
- Base: `https://app-sejago-site.sib2b.com.br`
- Auth: POST /auth/login → `access_token` (1h), rate limit = 1 req/window
- API key header: `X-Api-Sib2b: {GF_API_TOKEN}` (long-lived, exp 2091)
- PATCH /clientes/{clienteUuid}/{opUuid}/pessoais — needs `operacao_uuid` in body
- PATCH /clientes/{clienteUuid}/{opUuid}/endereco — needs `operacao_uuid` in body  
- PATCH /clientes/{clienteUuid}/{opUuid}/bancario — needs `operacao_uuid` in body
- POST /operacoes/{opUuid}/implantar — no body needed, triggers bank submission
- bancario_conta_tipo: "Corrente" or "Poupança" (capitalized)
- bancario_tipo: "TED" string
