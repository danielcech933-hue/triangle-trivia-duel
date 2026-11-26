# Triangle Trivia Duel

Vytvoř mou vlastní verzi AZ kvízu pro dva hráče s pyramidou 28 polí (1 až 28 políček v 7 řadách, propojení tří stran trojúhelníku pro výhru).

Kategorie a témata:
- Herní věci (Gaming, videohry, konzole, postavy, esport)
- Ze světa (Zeměpis, historie, světové zajímavosti, věda)
- Sport (Fotbal, hokej, tenis, olympiáda, pravidla, legendy)
- Seriály (České i světové kultovní seriály, sitkomy)
- Filmy (Filmy, režiséři, herci, filmové hlášky)
- Vše dohromady (Velký mix všech témat)

Klíčové požadavky:
- Velká a rozsáhlá databáze otázek pro všechny kategorie a písmena abecedy, aby se otázky neopakovaly a hra neomrzela.
- Mechanika odpovědí: Vypisování textem s inteligentní validací (automatická tolerance diakritiky, velkých/malých písmen, ořez mezer a tolerance drobných překlepů).
- Herní módy:
  1. Online multiplayer pro 2 hráče (vytvoření místnosti s kódem nebo linkem, čekací lobby, realtime synchronizace stavu hry, tahů a odpočtu).
  2. Lokální hra pro 2 hráče (Pass & Play u jednoho displeje) a trénink proti AI soupeři.
- Kompletní pravidla AZ kvízu:
  - Výběr pole aktivním hráčem -> zobrazení otázky a písmene.
  - Správná odpověď = obarvení pole do barvy hráče (Modrý vs Oranžový).
  - Chybná odpověď = možnost pro druhého hráče, jinak pole zčerná.
  - Výběr černého pole = náhradní otázka (souboj o černé pole).
  - Grafový algoritmus na detekci propojení všech tří stran trojúhelníku, vítězná obrazovka a statistiky zápasu.
- Stylový tmavý design s neonovými barvami hráčů, přehledné na mobilu i desktopu, zvukové/vizuální efekty.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://triangle-trivia-duel.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c0271c7c-5f72-4ac8-b47e-1f6cec0ef010).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
