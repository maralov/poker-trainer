# ref-truth.json

Еталон, знятий з `poker-trainer.html` — не редагувати вручну.

Файл згенеровано виконанням чистих блоків референсу (примітиви + діапазони) у node
і серіалізацією результату: повний склад кожного діапазону, відсотки в комбо,
розгортка токенів. Тести engine звіряються саме з ним, а не з числами, вписаними
з голови — так порт перевіряється проти оригіналу, а не проти моїх припущень.

Перегенерувати (якщо свідомо змінюється логіка в референсі):

```bash
python3 - <<'PY'
import pathlib
lines = pathlib.Path('poker-trainer.html').read_text(encoding='utf-8').split('\n')
pathlib.Path('/tmp/ref-core.js').write_text('\n'.join(lines[370:397] + lines[410:470]), encoding='utf-8')
PY
node web/src/engine/__fixtures__/dump.mjs /tmp/ref-core.js web/src/engine/__fixtures__/ref-truth.json
```

# ref-postflop.json

Еталон постфлоп-ядра (`evaluate`, `texture`, `decide`) з `poker-trainer.html`.
4000 детерміновано згенерованих роздач із рішенням для кожної. Референс знає
лише флоп, тому й еталон лише про флоп: терн і рівер описані спекою
`docs/superpowers/specs/2026-08-11-postflop-stage-design.md`.

Перегенерувати:

```bash
python3 - <<'PY'
import pathlib
lines = pathlib.Path('poker-trainer.html').read_text(encoding='utf-8').split('\n')
pathlib.Path('web/src/engine/__fixtures__/ref-postflop-core.js').write_text(
    '\n'.join(lines[370:397] + lines[1026:1116]), encoding='utf-8')
PY
node web/src/engine/__fixtures__/dump-postflop.mjs \
  web/src/engine/__fixtures__/ref-postflop-core.js \
  web/src/engine/__fixtures__/ref-postflop.json
```
