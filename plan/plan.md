# Plan: Modale, custom licencje, upload .exe, wykres, Dodatki, HWID

## 1. Ładne modale zamiast systemowych okien
- Usunięcie wszystkich systemowych confirm/alert (np. przy usuwaniu konta w adminie).
- Własny animowany modal potwierdzenia w stylu strony (czarno-biały, zaokrąglony, z animacją wejścia): tytuł, opis, przyciski Potwierdź / Anuluj.
- Modal użyty przy: usuwaniu użytkownika, blokowaniu, oraz w innych miejscach wymagających potwierdzenia.

## 2. Customowa ilość dni przy nadawaniu licencji
- W panelu admina przy każdym użytkowniku: oprócz przycisków 30D / 90D / LIFETIME pole na własną liczbę dni + przycisk "Nadaj".
- Customowa licencja generuje normalny klucz i wygasa po podanej liczbie dni.

## 3. Upload .exe w panelu admina
- Nowa karta w adminie: upload prawdziwego pliku .exe (instalki clienta).
- Plik ląduje w bezpiecznym storage (integracja platformy), w adminie widać nazwę, rozmiar i datę uploadu.
- Zakładka "Pobierz plik" u użytkownika pobiera DOKŁADNIE ten plik, który admin wgrał (z prawdziwą nazwą i rozmiarem). Jeśli admin nic nie wgrał, użytkownik dostaje placeholder.

## 4. Wykres w Przeglądzie admina
- Ładny wykres (biała linia na czarnym) odwiedzin strony z ostatnich 14 dni, pod kartami statystyk.

## 5. Sekcja "Przeglądaj produkty!" jak na screenie
- Nad kartami cen: nagłówek "Przeglądaj produkty!" + krótki opis + przełącznik-pigułka: Subskrypcje | Dodatki.
- Subskrypcje = obecne 3 plany, ale z rozbudowanymi listami:
  - Wspólne (wszystkie plany, ✓): pełny dostęp do modułów, aktualizacje, wsparcie Discord, natychmiastowy klucz.
  - Tylko Lifetime (✓): darmowy reset HWID co 7 dni; wczesny dostęp do nowych modułów (beta). Przy 30d i 90d te dwie pozycje mają ✗.
- Dodatki = 2 karty:
  - HWID Reset — 20 zł (jednorazowy dodatkowy reset HWID).
  - Tester — 25 zł (ZAKŁADANA cena, do zmiany): status testera i przedwczesny dostęp do wszystkiego.
- Kupno dodatków działa jak licencje (tryb demo, klucz/wpis w historii płatności).

## 6. HWID w panelu użytkownika
- W zakładce "Pobierz plik" karta HWID:
  - Lifetime: przycisk "Resetuj HWID" za darmo, z licznikiem cooldownu (dostępne co 7 dni).
  - Pozostali: reset zużywa kupiony dodatek HWID Reset (widoczna liczba kredytów).
  - Testerzy widzą badge "TESTER" w nagłówku panelu.

## Założenia
- Cena Testera: 25 zł (nie podałeś — do zmiany na Twoje słowo).
- Płatności nadal demo (bez prawdziwych pieniędzy).
- Limit pliku .exe: 100 MB.
