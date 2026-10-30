## ADDED Requirements

### Requirement: Configure named model profiles

The system SHALL support multiple named model profiles with one selected default profile.

#### Scenario: Add and select a profile

- **WHEN** the user adds a valid model profile and requests it as default
- **THEN** the profile is persisted in `.bossflow/config.yaml`
- **AND** `bossflow model list` marks it as the default

#### Scenario: Prevent invalid profile removal

- **WHEN** the user attempts to remove the current default profile
- **THEN** the operation is rejected
- **AND** the user is instructed to select another default first

### Requirement: Support OpenAI and OpenAI-compatible providers

The system SHALL support an OpenAI profile and an OpenAI-compatible Chat Completions profile.

#### Scenario: Resolve an OpenAI-compatible profile

- **WHEN** an `openai-compatible` profile provides a model and endpoint
- **THEN** the runtime uses the Chat Completions protocol
- **AND** does not require Responses API-only features

#### Scenario: Validate an endpoint

- **WHEN** a remote endpoint does not use HTTPS
- **THEN** profile validation rejects it
- **AND** plain HTTP remains allowed only for localhost loopback addresses

### Requirement: Resolve credentials without storing them in project configuration

The system SHALL resolve a profile credential from its referenced environment variable before consulting the local credentials file.

#### Scenario: Environment credential takes precedence

- **WHEN** the referenced environment variable contains a non-empty value
- **THEN** that value is used
- **AND** the credential source is reported as `environment`

#### Scenario: Use the local credential fallback

- **WHEN** the environment variable is absent and a matching local credential exists
- **THEN** the local credential is used
- **AND** the credential source is reported as `local-file`

### Requirement: Protect locally stored credentials

The system SHALL store CLI-managed credentials outside `config.yaml` in a Git-ignored file with owner-only permissions.

#### Scenario: Store a credential through the CLI

- **WHEN** the user sets a credential for a model profile without supplying it as a command-line value
- **THEN** the credential is written to `.bossflow/credentials.local.yaml`
- **AND** the file permissions are `0600`
- **AND** `config.yaml` does not contain the secret

#### Scenario: Reject unsafe credential storage

- **WHEN** the credentials path is a symlink or the file is readable by group or other users
- **THEN** credential resolution fails with an actionable error

### Requirement: Preserve structured output across providers

The system SHALL use native structured output for OpenAI profiles and SHALL use prompt-directed JSON with local Zod validation for OpenAI-compatible profiles.

#### Scenario: Generate native structured output

- **WHEN** the selected profile is OpenAI
- **THEN** the Agent declares the specification Zod schema as its output type

#### Scenario: Generate compatible structured output

- **WHEN** the selected profile is OpenAI-compatible
- **THEN** the Agent requests a JSON object through instructions
- **AND** local code parses and validates the result against the specification schema
- **AND** Markdown JSON code fences are accepted

### Requirement: Control tracing and test model connectivity

The system SHALL disable OpenAI trace export by default and SHALL provide a connectivity probe that validates authentication and structured output.

#### Scenario: Test a model profile

- **WHEN** the user runs `bossflow model test <profile>` with a valid credential
- **THEN** the system sends a minimal request
- **AND** validates the structured response
- **AND** reports success without requiring an OpenAI tracing key

#### Scenario: Verify DeepSeek compatibility

- **WHEN** the DeepSeek profile uses `deepseek-flash` at `https://api.deepseek.com`
- **THEN** the model probe succeeds without sending a `json_schema` response format
