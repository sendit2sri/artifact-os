# E2E compose config checks — portable across Compose v2 + jq
# Input: docker compose config --format json
# Output: {"e2e_mode":"true"|"false"|"missing","seed":"true"|"false"|"missing","bind_mounts":["src:dst",...]}

def envmap:
  (.environment // {}) as $e
  | if ($e | type) == "array"
    then ($e | map(select(test("="))) | map(split("=") | {(.[0]): (.[1:] | join("="))}) | add // {})
    else $e
    end;

def getflag($k):
  (envmap | .[$k]) | if . == null or . == "" then "missing" else (tostring | ascii_downcase) end;

def mounts:
  (.volumes // []) as $v
  | if ($v | type) == "array" and ($v | length) > 0 and (($v[0] | type) == "string")
    then ($v | map(split(":") | {type: "bind", source: .[0], target: (.[1:] | join(":"))}))
    else $v
    end;

.services.web
| {
    e2e_mode: getflag("NEXT_PUBLIC_E2E_MODE"),
    seed: getflag("NEXT_PUBLIC_ENABLE_TEST_SEED"),
    bind_mounts: (mounts | map(select(.type == "bind")) | map("\(.source):\(.target)"))
  }
