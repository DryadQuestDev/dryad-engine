# Placeholders

## Gendered pronouns

Require a character key argument. Resolve based on the character's `gender` attribute.

| Placeholder | Male | Female |
|---|---|---|
| `\|he(char_id)\|` / `\|He(char_id)\|` | he / He | she / She |
| `\|his(char_id)\|` / `\|His(char_id)\|` | his / His | her / Her |
| `\|him(char_id)\|` / `\|Him(char_id)\|` | him / Him | her / Her |
| `\|himself(char_id)\|` / `\|Himself(char_id)\|` | himself / Himself | herself / Herself |
| `\|he's(char_id)\|` / `\|He's(char_id)\|` | he's / He's | she's / She's |
| `\|he'd(char_id)\|` / `\|He'd(char_id)\|` | he'd / He'd | she'd / She'd |
| `\|he'll(char_id)\|` / `\|He'll(char_id)\|` | he'll / He'll | she'll / She'll |

Uppercase = sentence start. The argument is a character ID.

## POV (point of view)

No argument — these are global, based on the `point_of_view` game setting.

| Placeholder | 1st person | 2nd person |
|---|---|---|
| `\|i\|` / `\|I\|` | I / I | you / You |
| `\|me\|` / `\|Me\|` | me / Me | you / You |
| `\|my\|` / `\|My\|` | my / My | your / Your |
| `\|mine\|` / `\|Mine\|` | mine / Mine | yours / Yours |
| `\|myself\|` / `\|Myself\|` | myself / Myself | yourself / Yourself |
| `\|am\|` / `\|Am\|` | am / Am | are / Are |
| `\|was\|` / `\|Was\|` | was / Was | were / Were |
| `\|i'm\|` / `\|I'm\|` | I'm / I'm | you're / You're |
| `\|i've\|` / `\|I've\|` | I've / I've | you've / You've |
| `\|i'd\|` / `\|I'd\|` | I'd / I'd | you'd / You'd |
| `\|i'll\|` / `\|I'll\|` | I'll / I'll | you'll / You'll |
| `\|we\|` / `\|We\|` | we / We | you / You |
| `\|us\|` / `\|Us\|` | us / Us | you / You |
| `\|our\|` / `\|Our\|` | our / Our | your / Your |
| `\|ours\|` / `\|Ours\|` | ours / Ours | yours / Yours |
| `\|ourselves\|` / `\|Ourselves\|` | ourselves / Ourselves | yourselves / Yourselves |
| `\|we're\|` / `\|We're\|` | we're / We're | you're / You're |
| `\|we've\|` / `\|We've\|` | we've / We've | you've / You've |

Lowercase = mid-sentence. Uppercase = sentence start (2nd person form gets capitalized).
