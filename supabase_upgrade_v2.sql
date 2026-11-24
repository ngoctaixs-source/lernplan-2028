-- =====================================================================
-- LERNPLAN 2028 v2.0 — NÂNG CẤP CƠ SỞ DỮ LIỆU AN TOÀN (KHÔNG MẤT BÀI CŨ)
-- Copy toàn bộ file này dán vào Supabase -> SQL Editor -> bấm Run
-- =====================================================================

-- 1. Mở rộng các bảng hiện có (an toàn với IF NOT EXISTS)
alter table public.lessons
  add column if not exists source_image_url text default '';

alter table public.lesson_sections
  add column if not exists diagram_json jsonb,
  add column if not exists video_urls jsonb default '[]'::jsonb,
  add column if not exists video_keywords jsonb default '[]'::jsonb;

alter table public.user_flashcard_progress
  add column if not exists next_review_at timestamptz default now(),
  add column if not exists interval_days int default 0,
  add column if not exists ease_factor real default 2.5,
  add column if not exists repetitions int default 0;

-- 2. Bảng Từ vựng chuyên ngành theo từng bài học (Vocabularies)
create table if not exists public.vocabularies (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete cascade not null,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  word_de text not null,
  article text default '',
  plural text default '',
  word_type text default 'Nomen',
  meaning_vn text not null,
  example_de text default '',
  example_vn text default '',
  grammar_note_vn text default '',
  created_at timestamptz default now()
);

-- 3. Bảng Bộ nhớ đệm Từ điển Bấm-Đâu-Dịch-Đó (Dictionary Cache)
create table if not exists public.dictionary_cache (
  word_key text primary key,
  lemma_de text not null,
  article text default '',
  plural text default '',
  word_type text default 'Nomen',
  meaning_vn text not null,
  example_de text default '',
  example_vn text default '',
  grammar_note_vn text default '',
  created_at timestamptz default now()
);

-- 4. Bảng Bộ đề thi cũ (Altklausuren / Mock Exams)
create table if not exists public.mock_exams (
  id uuid primary key default gen_random_uuid(),
  title_de text not null,
  title_vn text default '',
  year_label text default 'IHK Altklausur',
  duration_minutes int default 90,
  description_vn text default '',
  created_at timestamptz default now()
);

-- 5. Bảng Câu hỏi trong Bộ đề thi cũ
create table if not exists public.mock_exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.mock_exams(id) on delete cascade not null,
  sort_order int default 0,
  section_label text default 'Aufgabe 1',
  q_type text not null check (q_type in ('mc', 'essay')),
  points int default 10,
  question_de text not null,
  question_vn text default '',
  options jsonb default '[]'::jsonb,
  correct_index int,
  model_answer_de text default '',
  model_answer_vn text default '',
  explanation_de text default '',
  explanation_vn text default '',
  diagram_json jsonb,
  created_at timestamptz default now()
);

-- 6. Bảng Ghi chú cá nhân dưới từng mục học (Eigene Notizen)
create table if not exists public.user_section_notes (
  user_id uuid references auth.users(id) on delete cascade not null,
  section_id uuid references public.lesson_sections(id) on delete cascade not null,
  note_text text default '',
  updated_at timestamptz default now(),
  primary key (user_id, section_id)
);

-- 7. Bảng Kho câu làm sai (Mistake Bank)
create table if not exists public.user_wrong_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source_type text default 'lesson' check (source_type in ('lesson', 'exam')),
  question_id text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  lesson_id uuid references public.lessons(id) on delete set null,
  question_snapshot jsonb not null,
  user_answer text default '',
  feedback_vn text default '',
  resolved boolean default false,
  created_at timestamptz default now()
);

-- =====================================================================
-- BẬT RLS & CẤP QUYỀN TRUY CẬP ĐẦY ĐỦ (CHỐNG LỖI PERMISSION DENIED)
-- =====================================================================
alter table public.vocabularies enable row level security;
alter table public.dictionary_cache enable row level security;
alter table public.mock_exams enable row level security;
alter table public.mock_exam_questions enable row level security;
alter table public.user_section_notes enable row level security;
alter table public.user_wrong_questions enable row level security;

-- Xóa policy cũ nếu chạy lại
drop policy if exists "Public read vocabularies" on public.vocabularies;
drop policy if exists "Admin write vocabularies" on public.vocabularies;
drop policy if exists "Public read dictionary_cache" on public.dictionary_cache;
drop policy if exists "Public write dictionary_cache" on public.dictionary_cache;
drop policy if exists "Public read mock_exams" on public.mock_exams;
drop policy if exists "Admin write mock_exams" on public.mock_exams;
drop policy if exists "Public read mock_exam_questions" on public.mock_exam_questions;
drop policy if exists "Admin write mock_exam_questions" on public.mock_exam_questions;
drop policy if exists "User own section notes" on public.user_section_notes;
drop policy if exists "User own wrong questions" on public.user_wrong_questions;

-- Quyền đọc/ghi
create policy "Public read vocabularies" on public.vocabularies for select using (true);
create policy "Admin write vocabularies" on public.vocabularies for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read dictionary_cache" on public.dictionary_cache for select using (true);
create policy "Public write dictionary_cache" on public.dictionary_cache for all using (true) with check (true);

create policy "Public read mock_exams" on public.mock_exams for select using (true);
create policy "Admin write mock_exams" on public.mock_exams for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read mock_exam_questions" on public.mock_exam_questions for select using (true);
create policy "Admin write mock_exam_questions" on public.mock_exam_questions for all using (public.is_admin()) with check (public.is_admin());

create policy "User own section notes" on public.user_section_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "User own wrong questions" on public.user_wrong_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cấp quyền schema & bảng cho anon và authenticated
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

grant select on public.subjects, public.lessons, public.lesson_sections, public.flashcards, public.quiz_questions, public.vocabularies, public.mock_exams, public.mock_exam_questions to anon, authenticated;
grant insert, update, delete on public.subjects, public.lessons, public.lesson_sections, public.flashcards, public.quiz_questions, public.vocabularies, public.mock_exams, public.mock_exam_questions to authenticated;
grant select, insert, update on public.dictionary_cache to anon, authenticated;
grant select, insert, update, delete on public.user_flashcard_progress, public.user_quiz_attempts, public.user_section_notes, public.user_wrong_questions to authenticated;

-- =====================================================================
-- NẠP THÊM DỮ LIỆU MẪU V2 (BIỂU ĐỒ BREAK-EVEN, TỪ VỰNG, ĐỀ THI MẪU)
-- =====================================================================
do $$
declare
  l_vertrag uuid;
  l_bep uuid;
  s_recht uuid;
  s_kalk uuid;
  sec_bep uuid;
  sec_vertrag uuid;
  ex1_id uuid;
begin
  -- Tìm các bài mẫu có sẵn
  select id, subject_id into l_vertrag, s_recht from public.lessons where title_de ilike '%Zustandekommen%' limit 1;
  select id, subject_id into l_bep, s_kalk from public.lessons where title_de ilike '%Break-even%' limit 1;

  -- Gắn biểu đồ Break-even-Point & từ khóa video mẫu vào mục Break-even nếu chưa có
  if l_bep is not null then
    select id into sec_bep from public.lesson_sections where lesson_id = l_bep and heading_de ilike '%Break-even%' limit 1;
    if sec_bep is not null then
      update public.lesson_sections
      set
        diagram_json = coalesce(diagram_json, '{
          "type": "break_even",
          "title": "Break-even-Point Diagramm (Beispiel: Konzert)",
          "kf": 6000,
          "kv": 6,
          "price": 26,
          "unit": "Tickets",
          "currency": "€"
        }'::jsonb),
        video_keywords = case when coalesce(jsonb_array_length(video_keywords), 0) = 0 then '[
          {"label": "Studyflix: Break-even-Point erklärt", "query": "Break even Point berechnen einfach erklärt Studyflix"},
          {"label": "Deckungsbeitrag IHK Übung", "query": "Stückdeckungsbeitrag Break Even Point IHK Prüfung Veranstaltungskaufmann"}
        ]'::jsonb else video_keywords end
      where id = sec_bep;
    end if;
  end if;

  -- Gắn sơ đồ quy trình & từ khóa video mẫu vào mục Hợp đồng
  if l_vertrag is not null then
    select id into sec_vertrag from public.lesson_sections where lesson_id = l_vertrag and heading_de ilike '%Zustandekommen%' limit 1;
    if sec_vertrag is not null then
      update public.lesson_sections
      set
        diagram_json = coalesce(diagram_json, '{
          "type": "flow",
          "title": "Ablauf: Wie kommt ein Vertrag zustande? (§§ 145–150 BGB)",
          "steps": [
            {"title": "1. Antrag (§ 145 BGB)", "subtitle": "Verbindliches Angebot", "badge": "1. WE"},
            {"title": "2. Annahme (§ 147 BGB)", "subtitle": "Exaktes Ja ohne Änderung", "badge": "2. WE"},
            {"title": "3. Wirksamer Vertrag", "subtitle": "Rechte & Pflichten gelten", "badge": "Ergebnis"}
          ]
        }'::jsonb),
        video_keywords = case when coalesce(jsonb_array_length(video_keywords), 0) = 0 then '[
          {"label": "Simpleclub: Vertrag Zustandekommen BGB", "query": "Zustandekommen eines Vertrages Antrag Annahme BGB einfach erklärt"},
          {"label": "Dienstvertrag vs. Werkvertrag", "query": "Unterschied Dienstvertrag Werkvertrag einfach erklärt"}
        ]'::jsonb else video_keywords end
      where id = sec_vertrag;
    end if;
  end if;

  -- Nạp từ vựng mẫu nếu bảng vocabularies đang trống
  if not exists (select 1 from public.vocabularies limit 1) then
    if l_vertrag is not null and s_recht is not null then
      insert into public.vocabularies (subject_id, lesson_id, word_de, article, plural, word_type, meaning_vn, example_de, example_vn, grammar_note_vn)
      values
      (s_recht, l_vertrag, 'Willenserklärung', 'die', 'die Willenserklärungen', 'Nomen', 'Tuyên bố ý chí (cơ sở tạo nên giao dịch pháp lý)', 'Für einen Vertrag braucht man zwei übereinstimmende Willenserklärungen.', 'Để tạo thành hợp đồng cần có hai tuyên bố ý chí trùng khớp.', 'Danh từ ghép kết thúc bằng -ung luôn là giống cái (die).'),
      (s_recht, l_vertrag, 'Werkvertrag', 'der', 'die Werkverträge', 'Nomen', 'Hợp đồng chế tác (cam kết bàn giao thành quả cụ thể)', 'Der Bühnenbau wird über einen Werkvertrag geregelt.', 'Việc dựng sân khấu được quy định thông qua một hợp đồng chế tác.', 'Chú ý phân biệt với der Dienstvertrag (hợp đồng dịch vụ).'),
      (s_recht, l_vertrag, 'Abnahme', 'die', 'die Abnahmen', 'Nomen', 'Sự nghiệm thu (xác nhận hoàn thành đúng hợp đồng)', 'Erst nach der Abnahme der Bühne wird die Rechnung fällig.', 'Chỉ sau khi nghiệm thu sân khấu thì hóa đơn mới đến hạn thanh toán.', 'Động từ tương ứng: abnehmen (nghiệm thu).'),
      (s_recht, l_vertrag, 'freibleibend', '', '', 'Adjektiv', 'Không ràng buộc (điều khoản loại trừ ràng buộc trong báo giá)', 'Unser Angebot ist bis zum 15. Mai freibleibend.', 'Báo giá của chúng tôi không mang tính ràng buộc cho tới ngày 15/5.', 'Dùng làm Freizeichnungsklausel để tránh bị ràng buộc theo § 145 BGB.');
    end if;

    if l_bep is not null and s_kalk is not null then
      insert into public.vocabularies (subject_id, lesson_id, word_de, article, plural, word_type, meaning_vn, example_de, example_vn, grammar_note_vn)
      values
      (s_kalk, l_bep, 'Deckungsbeitrag', 'der', 'die Deckungsbeiträge', 'Nomen', 'Số dư đảm phí (phần chênh lệch giá bán trừ chi phí biến đổi)', 'Jedes verkaufte Ticket liefert einen Deckungsbeitrag von 20 €.', 'Mỗi tấm vé bán ra mang lại một số dư đảm phí là 20 €.', 'Ký hiệu: db (cho 1 đơn vị) và DB (tổng số dư đảm phí).'),
      (s_kalk, l_bep, 'Gewinnschwelle', 'die', 'die Gewinnschwellen', 'Nomen', 'Điểm hòa vốn (tên tiếng Đức của Break-even-Point)', 'Ab 300 verkauften Tickets erreichen wir die Gewinnschwelle.', 'Từ 300 vé bán ra là chúng ta đạt được điểm hòa vốn.', 'Đồng nghĩa 100% với der Break-even-Point.'),
      (s_kalk, l_bep, 'aufrunden', '', '', 'Verb', 'Làm tròn lên (nguyên tắc bắt buộc khi tính số vé hòa vốn)', 'Bei 248,48 Tickets muss man immer auf 249 Tickets aufrunden.', 'Khi tính ra 248,48 vé thì luôn phải làm tròn lên thành 249 vé.', 'Động từ tách: ich runde auf / aufgerundet.');
    end if;
  end if;

  -- Nạp 1 đề thi thử mẫu IHK nếu bảng mock_exams đang trống
  if not exists (select 1 from public.mock_exams limit 1) then
    insert into public.mock_exams (title_de, title_vn, year_label, duration_minutes, description_vn)
    values (
      'IHK Muster-Prüfung: Veranstaltungswirtschaft & Recht (Mini-Test)',
      'Đề thi thử mẫu IHK: Quản trị, Tính giá & Luật sự kiện',
      'IHK Muster 2026',
      30,
      'Đề mẫu 30 phút giúp bạn trải nghiệm phòng thi đếm giờ, làm cả trắc nghiệm lẫn chụp ảnh bài giải giấy nháp.'
    ) returning id into ex1_id;

    insert into public.mock_exam_questions (exam_id, sort_order, section_label, q_type, points, question_de, question_vn, options, correct_index, model_answer_de, model_answer_vn, explanation_de, explanation_vn)
    values
    (
      ex1_id, 1, 'Aufgabe 1 · Vertragsrecht', 'mc', 10,
      'Für ein Stadtfest engagieren Sie eine Event-Security-Firma zur Einlasskontrolle und ein Unternehmen für den schlüsselfertigen Aufbau der Hauptbühne. Welche Vertragstypen liegen vor?',
      'Cho một lễ hội thành phố, bạn thuê một công ty bảo vệ kiểm soát cổng vào và một công ty lắp dựng trọn gói sân khấu chính. Đây là hai loại hợp đồng nào?',
      '[{"de":"Security: Werkvertrag / Bühne: Dienstvertrag","vn":"Bảo vệ: Hợp đồng chế tác / Sân khấu: Hợp đồng dịch vụ"},{"de":"Security: Dienstvertrag / Bühne: Werkvertrag","vn":"Bảo vệ: Hợp đồng dịch vụ / Sân khấu: Hợp đồng chế tác"},{"de":"Beide sind Mietverträge (§ 535 BGB)","vn":"Cả hai đều là hợp đồng thuê (§ 535 BGB)"},{"de":"Beide sind Kaufverträge (§ 433 BGB)","vn":"Cả hai đều là hợp đồng mua bán (§ 433 BGB)"}]'::jsonb,
      1, '', '',
      'Security schuldet sorgfältiges Tätigwerden (Dienstvertrag, § 611 BGB), der Bühnenbau schuldet ein fertiges, mangelfreies Werk (Werkvertrag, § 631 BGB).',
      'Bảo vệ chỉ cam kết thực hiện công việc cẩn trọng (Dienstvertrag, § 611), còn dựng sân khấu phải giao thành quả hoàn chỉnh nghiệm thu được (Werkvertrag, § 631).'
    ),
    (
      ex1_id, 2, 'Aufgabe 2 · Kalkulation (Có thể chụp giấy nháp)', 'essay', 20,
      'Ein Open-Air-Konzert verursacht Fixkosten von 12.500 €. Der Brutto-Ticketpreis beträgt 35,70 € (inkl. 19 % MwSt.). Die variablen Kosten pro Gast betragen 5,00 € netto. Berechnen Sie: a) den Netto-Ticketpreis, b) den Stückdeckungsbeitrag (db), c) die Break-even-Menge (auf ganze Tickets gerundet). Tipp: Du kannst den Rechenweg auf Papier schreiben und abfotografieren!',
      'Một buổi hòa nhạc ngoài trời có chi phí cố định 12.500 €. Giá vé Brutto là 35,70 € (đã gồm 19% thuế MwSt). Chi phí biến đổi mỗi khách là 5,00 € ròng (netto). Hãy tính: a) Giá vé ròng Netto, b) Số dư đảm phí đơn vị (db), c) Sản lượng hòa vốn (làm tròn thành số vé nguyên). Mẹo: Bạn có thể viết bài giải ra giấy rồi bấm chụp ảnh nộp ngay bên dưới!',
      '[]'::jsonb, null,
      'a) Netto-Ticketpreis p = 35,70 € / 1,19 = 30,00 €. b) Stückdeckungsbeitrag db = 30,00 € - 5,00 € = 25,00 €. c) Break-even-Menge x_BEP = 12.500 € / 25,00 € = 500 Tickets.',
      'a) Giá vé ròng Netto p = 35,70 € / 1,19 = 30,00 €. b) Số dư đảm phí đơn vị db = 30,00 € - 5,00 € = 25,00 €. c) Số vé hòa vốn = 12.500 € / 25,00 € = 500 vé.',
      'Achtung Falle: Immer zuerst die 19 % MwSt aus dem Brutto-Preis herausrechnen!',
      'Bẫy đề IHK: Phải chia 1,19 để đổi giá Brutto sang Netto trước khi trừ chi phí biến đổi!'
    );
  end if;
end $$;
