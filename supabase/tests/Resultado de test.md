test `rls_isolation.sql` ejecutado el 11/11/2026 15:00

| test                                 | result | detail               |
| ------------------------------------ | ------ | -------------------- |
| trigger: 2 cuentas                   | PASS   | cuentas=2            |
| trigger: 2 perfiles                  | PASS   | perfiles=2           |
| user1: no borra activo de user2      | PASS   | filas=0              |
| user1: no cede su activo a user2     | PASS   | bloqueado por RLS    |
| user1: no inserta activo para user2  | PASS   | bloqueado por RLS    |
| user1: no lee invitaciones           | PASS   | permiso denegado     |
| user1: no modifica activo de user2   | PASS   | filas=0              |
| user1: no modifica perfil de user2   | PASS   | filas=0              |
| user1: no referencia cuenta de user2 | PASS   | bloqueado por FK/RLS |
| user1: no ve activos de user2        | PASS   | filas=0              |
| user1: no ve cuenta de user2         | PASS   | filas=0              |
| user1: no ve dividendos de user2     | PASS   | filas=0              |
| user1: no ve operaciones de user2    | PASS   | filas=0              |
| user1: no ve perfil de user2         | PASS   | filas=0              |
| user1: ve su cuenta                  | PASS   | filas=1              |
| user1: ve su perfil                  | PASS   | filas=1              |
| user1: ve sus activos                | PASS   | filas=1              |
| user1: ve sus dividendos             | PASS   | filas=1              |
| user1: ve sus operaciones            | PASS   | filas=1              |
| user2: no inserta activo para user1  | PASS   | bloqueado por RLS    |
| user2: no modifica activo de user1   | PASS   | filas=0              |
| user2: no ve activos de user1        | PASS   | filas=0              |
| user2: ve sus activos                | PASS   | filas=1              |