-- ============================================================
-- LERNPLAN 2028 — SUPABASE DATABASE & RLS SETUP
-- Copy toàn bộ file này dán vào Supabase -> SQL Editor -> Run
-- ============================================================

create extension if not exists "pgcrypto";

-- 1. Hàm kiểm tra quyền Admin (chỉ email ngoctaixs@gmail.com)
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'ngoctaixs@gmail.com';
$$;

-- 2. Bảng môn học (Subjects)
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  title_de text not null,
  title_vn text not null,
  description_de text default '',
  description_vn text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 3. Bảng bài học nhỏ (Lessons - sắp xếp từ Nền tảng -> Liên kết -> Mở rộng)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete cascade not null,
  title_de text not null,
  title_vn text not null,
  level text default 'foundation' check (level in ('foundation', 'connected', 'advanced')),
  sort_order int default 0,
  overview_de text not null,
  overview_vn text not null,
  created_at timestamptz default now()
);

-- 4. Bảng các mục kiến thức chi tiết trong bài học (Lesson Sections)
create table if not exists public.lesson_sections (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  sort_order int default 0,
  heading_de text not null,
  heading_vn text not null,
  content_de text not null,
  content_vn text not null,
  explanation_de text,
  explanation_vn text,
  example_de text,
  example_vn text,
  exam_tip_vn text,
  created_at timestamptz default now()
);

-- 5. Bảng Flashcards song ngữ
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  subject_id uuid references public.subjects(id) on delete cascade not null,
  category text default 'Fachbegriff',
  front_de text not null,
  hint_vn text default '',
  back_de text not null,
  back_vn text not null,
  example_de text default '',
  example_vn text default '',
  created_at timestamptz default now()
);

-- 6. Bảng câu hỏi Bài Test (Trắc nghiệm + Tự luận tình huống)
create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  sort_order int default 0,
  q_type text not null check (q_type in ('mc', 'essay')),
  question_de text not null,
  question_vn text not null,
  options jsonb default '[]'::jsonb,
  correct_index int,
  model_answer_de text default '',
  model_answer_vn text default '',
  explanation_de text default '',
  explanation_vn text default '',
  created_at timestamptz default now()
);

-- 7. Tiến độ thuộc Flashcard (riêng tư theo từng user đăng nhập)
create table if not exists public.user_flashcard_progress (
  user_id uuid references auth.users(id) on delete cascade not null,
  flashcard_id uuid references public.flashcards(id) on delete cascade not null,
  status text not null check (status in ('new', 'learning', 'mastered')),
  updated_at timestamptz default now(),
  primary key (user_id, flashcard_id)
);

-- 8. Lịch sử điểm Bài Test (riêng tư theo từng user đăng nhập)
create table if not exists public.user_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  lesson_id uuid references public.lessons(id) on delete cascade not null,
  score_percent int not null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- BẬT ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table public.subjects enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_sections enable row level security;
alter table public.flashcards enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.user_flashcard_progress enable row level security;
alter table public.user_quiz_attempts enable row level security;

-- Xóa policy cũ nếu chạy lại script
drop policy if exists "Public read subjects" on public.subjects;
drop policy if exists "Admin write subjects" on public.subjects;
drop policy if exists "Public read lessons" on public.lessons;
drop policy if exists "Admin write lessons" on public.lessons;
drop policy if exists "Public read sections" on public.lesson_sections;
drop policy if exists "Admin write sections" on public.lesson_sections;
drop policy if exists "Public read flashcards" on public.flashcards;
drop policy if exists "Admin write flashcards" on public.flashcards;
drop policy if exists "Public read quiz" on public.quiz_questions;
drop policy if exists "Admin write quiz" on public.quiz_questions;
drop policy if exists "User own flashcard progress" on public.user_flashcard_progress;
drop policy if exists "User own quiz attempts" on public.user_quiz_attempts;

-- Ai vào web cũng đọc được kho kiến thức dùng chung
create policy "Public read subjects" on public.subjects for select using (true);
create policy "Admin write subjects" on public.subjects for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read lessons" on public.lessons for select using (true);
create policy "Admin write lessons" on public.lessons for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read sections" on public.lesson_sections for select using (true);
create policy "Admin write sections" on public.lesson_sections for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read flashcards" on public.flashcards for select using (true);
create policy "Admin write flashcards" on public.flashcards for all using (public.is_admin()) with check (public.is_admin());

create policy "Public read quiz" on public.quiz_questions for select using (true);
create policy "Admin write quiz" on public.quiz_questions for all using (public.is_admin()) with check (public.is_admin());

-- Tiến độ học và điểm thi lưu riêng từng tài khoản
create policy "User own flashcard progress" on public.user_flashcard_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "User own quiz attempts" on public.user_quiz_attempts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- NẠP SẴN DỮ LIỆU MẪU CHUẨN IHK VERANSTALTUNGSKAUFMANN
-- (Chỉ chạy 1 lần nếu bảng subjects đang trống)
-- ============================================================
do $$
declare
  s1_id uuid;
  s2_id uuid;
  l1_id uuid;
  l2_id uuid;
  l3_id uuid;
begin
  if not exists (select 1 from public.subjects limit 1) then

    -- Môn 1: Veranstaltungsrecht & Verträge
    insert into public.subjects (title_de, title_vn, description_de, description_vn, sort_order)
    values (
      'Veranstaltungsrecht & Verträge',
      'Luật sự kiện & Hợp đồng (BGB)',
      'Grundlagen des Vertragsrechts, Vertragsarten in der Eventbranche sowie Haftung und Stornierung.',
      'Nền tảng luật hợp đồng BGB, các loại hợp đồng cốt lõi ngành sự kiện, trách nhiệm bồi thường và quy định hủy bỏ.',
      1
    ) returning id into s1_id;

    -- Bài 1.1 (Nền tảng)
    insert into public.lessons (subject_id, title_de, title_vn, level, sort_order, overview_de, overview_vn)
    values (
      s1_id,
      'Zustandekommen von Verträgen & Vertragsarten (§§ 145 ff., 611, 631 BGB)',
      'Sự hình thành hợp đồng & Các loại hợp đồng cơ bản trong ngành sự kiện',
      'foundation',
      1,
      'Im Veranstaltungsmanagement bilden rechtssichere Verträge das Fundament jeder Zusammenarbeit mit Kunden, Künstlern, Locations und Dienstleistern. Entscheidend sind das wirksame Zustandekommen durch zwei übereinstimmende Willenserklärungen sowie die exakte Abgrenzung zwischen Dienstvertrag, Werkvertrag und Mietvertrag.',
      'Trong quản trị sự kiện, hợp đồng chặt chẽ về pháp lý là nền móng cho mọi sự hợp tác với khách hàng, nghệ sĩ, địa điểm tổ chức và nhà cung cấp. Cốt lõi cần nắm là điều kiện hình thành hợp đồng (hai tuyên bố ý chí trùng khớp) và phân biệt chính xác Hợp đồng dịch vụ, Hợp đồng chế tác và Hợp đồng thuê.'
    ) returning id into l1_id;

    insert into public.lesson_sections (lesson_id, sort_order, heading_de, heading_vn, content_de, content_vn, explanation_de, explanation_vn, example_de, example_vn, exam_tip_vn)
    values
    (
      l1_id, 1,
      '1. Zustandekommen eines Vertrags (§§ 145–150 BGB)',
      '1. Điều kiện hình thành hợp đồng (§§ 145–150 BGB)',
      'Ein Vertrag kommt durch zwei inhaltlich übereinstimmende, in Bezug aufeinander abgegebene Willenserklärungen zustande: Antrag (Angebot, § 145 BGB) und Annahme (§ 147 BGB). Wer einem anderen die Schließung eines Vertrags anträgt, ist an den Antrag gebunden, es sei denn, dass er die Gebundenheit ausgeschlossen hat (Freizeichnungsklausel wie „freibleibend“). Eine verspätete oder inhaltlich abgeänderte Annahme gilt gemäß § 150 BGB als Ablehnung verbunden mit einem neuen Antrag.',
      'Một hợp đồng được hình thành thông qua hai tuyên bố ý chí (Willenserklärungen) có nội dung trùng khớp và hướng tới nhau: Đề nghị giao kết (Antrag/Angebot, § 145 BGB) và Chấp nhận đề nghị (Annahme, § 147 BGB). Người đưa ra đề nghị bị ràng buộc với đề nghị đó, trừ khi có điều khoản loại trừ ràng buộc (Freizeichnungsklausel như „freibleibend“ – không ràng buộc). Một sự chấp nhận trễ hạn hoặc có thay đổi nội dung theo § 150 BGB được coi là từ chối kèm theo một đề nghị mới.',
      'Stell dir einen Vertrag wie einen Handschlag vor: Person A macht ein verbindliches Angebot, Person B sagt exakt „Ja“ dazu. Sobald B aber sagt „Ja, aber 20 % günstiger“, gibt es noch keinen Vertrag – B hat gerade ein neues Gegenangebot gemacht.',
      'Hãy tưởng tượng hợp đồng như một cái bắt tay chốt kèo: Bên A gửi báo giá ràng buộc, bên B đồng ý y hệt 100% thì hợp đồng lập tức có hiệu lực. Nhưng nếu B bảo „Ok đồng ý, nhưng bớt 20% giá nhé“, lúc này CHƯA có hợp đồng nào cả — câu nói của B trở thành một đề nghị mới và chờ A đồng ý lại.',
      'Eine Eventagentur sendet ein verbindliches Catering-Angebot über 5.000 €. Der Kunde unterschreibt, streicht aber „5.000 €“ durch und schreibt „4.500 €“. Rechtsfolge nach § 150 Abs. 2 BGB: Kein Vertrag, sondern ein neuer Antrag des Kunden.',
      'Một công ty sự kiện gửi báo giá Catering ràng buộc 5.000 €. Khách hàng ký nhưng gạch số 5.000 € sửa thành 4.500 €. Hệ quả pháp lý theo § 150 khoản 2 BGB: Chưa có hợp đồng, đó là một đề nghị mới từ phía khách hàng.',
      'Từ khóa ăn điểm IHK: "zwei übereinstimmende Willenserklärungen", "Antrag & Annahme", "Freizeichnungsklausel (freibleibend)", "§ 150 BGB = Ablehnung + neuer Antrag".'
    ),
    (
      l1_id, 2,
      '2. Abgrenzung: Dienstvertrag (§ 611 BGB) vs. Werkvertrag (§ 631 BGB)',
      '2. Phân biệt cốt lõi: Hợp đồng dịch vụ (§ 611) và Hợp đồng chế tác (§ 631)',
      'Beim Dienstvertrag (§ 611 BGB) schuldet der Dienstverpflichtete lediglich das sorgfältige Tätigwerden (das Bemühen), nicht aber einen bestimmten Erfolg. Beim Werkvertrag (§ 631 BGB) hingegen schuldet der Unternehmer die Herstellung eines konkret vereinbarten, mangelfreien Erfolges (Werkes). Die Vergütung wird beim Werkvertrag grundsätzlich erst nach der Abnahme (§ 640 BGB) fällig, und es gelten umfassende Mängelrechte (Gewährleistung).',
      'Với Hợp đồng dịch vụ (Dienstvertrag, § 611 BGB), bên cung cấp chỉ có nghĩa vụ thực hiện công việc một cách cẩn trọng (nỗ lực làm việc), chứ không cam kết một kết quả cụ thể cuối cùng. Ngược lại, với Hợp đồng chế tác (Werkvertrag, § 631 BGB), nhà thầu bắt buộc phải tạo ra một thành quả cụ thể không có lỗi. Tiền công trong Werkvertrag về nguyên tắc chỉ đến hạn sau khi nghiệm thu (Abnahme, § 640 BGB) và có đầy đủ quyền khiếu nại lỗi (Gewährleistung).',
      'Die goldene Prüfungsfrage lautet immer: „Wird für die reine Arbeitszeit/Bemühung bezahlt oder für ein fertiges Ergebnis?“ Wenn du ein fertiges Produkt oder einen funktionierenden Aufbau abnehmen kannst, ist es ein Werkvertrag.',
      'Mẹo phân biệt không bao giờ sai khi đi thi IHK: Hãy hỏi „Mình trả tiền cho công sức/thời gian làm việc hay trả tiền cho một sản phẩm/thành quả hoàn chỉnh?“. Cứ có thể nghiệm thu sản phẩm xong xuôi mới trả tiền thì là Werkvertrag.',
      'Dienstvertrag: Moderation einer Gala, Sicherheitsdienst (Security), Garderobenpersonal. Werkvertrag: Aufbau der Open-Air-Bühne, Produktion eines Event-Imagefilms, Catering-Lieferung eines konkreten Buffets.',
      'Dienstvertrag (dịch vụ): MC dẫn chương trình Gala, nhân viên bảo vệ (Security), nhân viên trông giữ áo khoác. Werkvertrag (thành quả): Dựng hoàn chỉnh sân khấu ngoài trời, quay dựng video recap sự kiện, cung cấp tiệc Buffet đúng thực đơn.',
      'IHK cực hay ra câu tình huống hỏi sự khác nhau về "Erfolg geschuldet?" (có nợ thành quả không) và "Abnahme (§ 640 BGB)" (nghiệm thu).'
    ),
    (
      l1_id, 3,
      '3. Mietvertrag (§ 535 BGB) & Gemischte Verträge im Eventbereich',
      '3. Hợp đồng thuê (§ 535 BGB) & Hợp đồng hỗn hợp trong sự kiện',
      'Durch den Mietvertrag (§ 535 BGB) wird der Vermieter verpflichtet, dem Mieter den Gebrauch der Mietsache während der Mietzeit im vertragsgemäßen Zustand zu gewähren. In der Veranstaltungspraxis liegen häufig sogenannte gemischte Verträge (z. B. Raummietvertrag inklusive Technik, Personal und Catering) vor, bei denen je nach Schwerpunkt die Regeln des jeweiligen Vertragstyps Anwendung finden.',
      'Thông qua Hợp đồng thuê (Mietvertrag, § 535 BGB), bên cho thuê có nghĩa vụ giao cho bên thuê quyền sử dụng tài sản thuê trong tình trạng đúng như thỏa thuận suốt thời gian thuê. Trong thực tế ngành sự kiện rất hay xuất hiện „hợp đồng hỗn hợp“ (gemischte Verträge — ví dụ thuê hội trường kèm âm thanh, nhân sự và ăn uống), khi đó sẽ áp dụng quy định của từng loại hợp đồng tương ứng theo từng hạng mục.',
      'Wenn du eine Halle oder Lichttechnik nur für das Wochenende ausleihst und wieder zurückgibst, gilt Mietrecht. Wenn der Vermieter aber auch das Essen kocht und Techniker stellt, mischt das Gesetz Miet-, Werk- und Dienstvertragsrecht.',
      'Thuê hội trường hay thuê dàn loa đèn cuối tuần xong trả lại thì áp dụng luật thuê (Mietrecht). Nhưng nếu thuê trọn gói địa điểm kèm nấu tiệc và nhân viên phục vụ, pháp luật sẽ tách từng phần lỗi ra xử theo đúng luật của phần đó.',
      'Fällt bei einem All-inclusive-Kongress die Klimaanlage der Halle aus, greift Mietrecht (Mietminderung). Ist das Buffet verdorben, greift Werkvertragsrecht.',
      'Trong một hội nghị trọn gói, nếu điều hòa của hội trường bị hỏng thì áp dụng luật thuê (giảm tiền thuê - Mietminderung). Nếu đồ ăn Buffet bị hỏng thì áp dụng luật hợp đồng chế tác (Werkvertragsrecht).',
      'Nhớ thuật ngữ: "Gebrauchsüberlassung auf Zeit" (chuyển giao quyền sử dụng có thời hạn) và "Typengemischter Vertrag".'
    );

    insert into public.flashcards (lesson_id, subject_id, category, front_de, hint_vn, back_de, back_vn, example_de, example_vn)
    values
    (l1_id, s1_id, 'Recht', 'Willenserklärung (WE)', 'Tuyên bố ý chí', 'Äußerung eines privaten Willens, der unmittelbar auf die Herbeiführung einer Rechtsfolge gerichtet ist. Zwei übereinstimmende WE (Antrag + Annahme) bilden einen Vertrag.', 'Sự bày tỏ ý chí cá nhân nhằm trực tiếp tạo ra một hệ quả pháp lý. Hai tuyên bố ý chí trùng khớp (Đề nghị + Chấp nhận) tạo thành hợp đồng.', 'Unterschrift unter dem Künstlervertrag.', 'Chữ ký dưới hợp đồng thuê nghệ sĩ.'),
    (l1_id, s1_id, 'Recht', 'Freizeichnungsklausel', 'Điều khoản loại trừ ràng buộc', 'Zusatz im Angebot (z. B. „freibleibend“, „solange der Vorrat reicht“), durch den die gesetzliche Bindungswirkung des § 145 BGB ausgeschlossen wird.', 'Ghi chú thêm trong báo giá (VD: „freibleibend“ – không ràng buộc) nhằm loại bỏ hiệu lực ràng buộc pháp lý theo § 145 BGB.', '„Unser Angebot für die Halle ist bis zur schriftlichen Bestätigung freibleibend.“', '„Báo giá thuê hội trường của chúng tôi không mang tính ràng buộc cho tới khi có xác nhận bằng văn bản.“'),
    (l1_id, s1_id, 'Fachbegriff', 'Werkvertrag (§ 631 BGB)', 'Hợp đồng chế tác / thành quả', 'Vertragstyp, bei dem der Unternehmer einen konkret vereinbarten, mangelfreien Erfolg schuldet. Vergütung wird erst nach Abnahme (§ 640 BGB) fällig.', 'Loại hợp đồng mà nhà thầu phải cam kết tạo ra một kết quả hoàn chỉnh không lỗi. Tiền công chỉ đến hạn sau khi nghiệm thu.', 'Bühnenbau, Event-Dekoration, Erstellung einer Website.', 'Dựng sân khấu, trang trí sự kiện, thiết kế website sự kiện.'),
    (l1_id, s1_id, 'Fachbegriff', 'Dienstvertrag (§ 611 BGB)', 'Hợp đồng dịch vụ', 'Vertragstyp, bei dem ausschließlich das sorgfältige Tätigwerden (Bemühen), jedoch kein konkreter Erfolg geschuldet wird.', 'Loại hợp đồng chỉ yêu cầu nỗ lực thực hiện công việc cẩn trọng, không cam kết kết quả cụ thể.', 'Security-Personal, Moderator, DJ-Tätigkeit nach Stunden.', 'Nhân viên bảo vệ, MC, DJ đánh nhạc theo giờ.'),
    (l1_id, s1_id, 'Recht', '§ 150 Abs. 2 BGB (Abgeänderte Annahme)', 'Chấp nhận có sửa đổi nội dung', 'Eine Annahme unter Erweiterungen, Einschränkungen oder sonstigen Änderungen gilt als Ablehnung verbunden mit einem neuen Antrag.', 'Một sự chấp nhận kèm theo mở rộng, hạn chế hoặc thay đổi khác được coi là từ chối kèm theo một đề nghị mới.', 'Kunde ändert den Preis im Angebot handschriftlich ab.', 'Khách hàng tự viết tay sửa lại giá trên tờ báo giá.');

    insert into public.quiz_questions (lesson_id, sort_order, q_type, question_de, question_vn, options, correct_index, model_answer_de, model_answer_vn, explanation_de, explanation_vn)
    values
    (
      l1_id, 1, 'mc',
      'Welche Leistung im Veranstaltungsbereich ist typischerweise ein Werkvertrag (§ 631 BGB)?',
      'Hạng mục nào sau đây trong lĩnh vực tổ chức sự kiện là điển hình của Hợp đồng chế tác (Werkvertrag, § 631 BGB)?',
      '[{"de":"Einsatz von Sicherheitspersonal am Einlass","vn":"Bố trí nhân viên bảo vệ tại cổng soát vé"},{"de":"Aufbau einer geprüften Open-Air-Bühne nach Bauplan","vn":"Lắp dựng hoàn chỉnh sân khấu ngoài trời đạt chuẩn theo bản vẽ"},{"de":"Moderation einer Podiumsdiskussion","vn":"Dẫn chương trình một buổi tọa đàm"},{"de":"Anmietung von 200 Bankettstühlen für zwei Tage","vn":"Thuê 200 ghế tiệc trong hai ngày"}]'::jsonb,
      1, '', '',
      'Beim Bühnenbau wird ein konkretes, mangelfreies Ergebnis (die fertige, sichere Bühne) geschuldet, das abgenommen werden muss (§ 640 BGB).',
      'Khi dựng sân khấu, nhà thầu bắt buộc phải giao thành phẩm hoàn chỉnh, an toàn và phải qua bước nghiệm thu (§ 640 BGB). Bảo vệ và MC là Dienstvertrag; thuê ghế là Mietvertrag.'
    ),
    (
      l1_id, 2, 'mc',
      'Sie senden einem Kunden ein verbindliches Angebot über 12.000 € ohne Freizeichnungsklausel. Der Kunde antwortet fristgerecht: „Wir nehmen an, zahlen aber nur 10.500 €.“ Wie ist die Rechtslage?',
      'Bạn gửi cho khách một báo giá ràng buộc 12.000 € (không có điều khoản freibleibend). Khách trả lời đúng hạn: „Chúng tôi đồng ý, nhưng chỉ trả 10.500 € thôi.“ Tình trạng pháp lý là gì?',
      '[{"de":"Der Vertrag ist wirksam über 12.000 € zustande gekommen.","vn":"Hợp đồng đã có hiệu lực với mức giá 12.000 €."},{"de":"Der Vertrag ist wirksam über 10.500 € zustande gekommen.","vn":"Hợp đồng đã có hiệu lực với mức giá 10.500 €."},{"de":"Es liegt kein Vertrag vor; die Antwort gilt als Ablehnung mit neuem Antrag (§ 150 Abs. 2 BGB).","vn":"Chưa có hợp đồng; câu trả lời đó là sự từ chối kèm một đề nghị mới (§ 150 Abs. 2 BGB)."},{"de":"Der Vertrag ist nichtig wegen Formmangels.","vn":"Hợp đồng vô hiệu do lỗi hình thức."}]'::jsonb,
      2, '', '',
      'Da die Annahme den Preis abändert, stimmen die Willenserklärungen nicht überein. Nach § 150 Abs. 2 BGB gilt dies als Ablehnung verbunden mit einem neuen Antrag.',
      'Do bên khách tự ý thay đổi giá nên hai tuyên bố ý chí không trùng khớp. Theo § 150 khoản 2 BGB, đây là từ chối báo giá cũ và gửi một đề nghị mới.'
    ),
    (
      l1_id, 3, 'essay',
      'Praxisfall: Ihre Agentur beauftragt eine Technikfirma mit der kompletten Installation der Licht- und Tonanlage für ein Konzert. Nach der Installation flackern mehrere Scheinwerfer. Erklären Sie, welcher Vertragstyp vorliegt und welche rechtliche Bedeutung die „Abnahme“ hat.',
      'Tình huống thực tế: Công ty sự kiện của bạn thuê một đơn vị kỹ thuật lắp đặt trọn gói hệ thống ánh sáng và âm thanh cho một buổi hòa nhạc. Sau khi lắp xong, nhiều đèn sân khấu bị nhấp nháy. Hãy giải thích đây là loại hợp đồng gì và việc „Abnahme“ (nghiệm thu) có ý nghĩa pháp lý như thế nào?',
      '[]'::jsonb, null,
      'Es liegt ein Werkvertrag gemäß § 631 BGB vor, da ein konkretes, mangelfreies Ergebnis (funktionsfähige Licht- und Tonanlage) geschuldet wird. Durch die Abnahme (§ 640 BGB) bestätigt der Auftraggeber die vertragsgemäße Herstellung. Erst mit der Abnahme wird die Vergütung fällig, die Gefahr geht auf den Auftraggeber über und die Verjährungsfrist für Mängelansprüche beginnt. Wegen des wesentlichen Mangels (flackernde Scheinwerfer) kann die Agentur die Abnahme verweigern und Nacherfüllung verlangen.',
      'Đây là Hợp đồng chế tác (Werkvertrag) theo § 631 BGB vì nhà thầu phải bàn giao một thành quả cụ thể không lỗi (hệ thống âm thanh ánh sáng hoạt động chuẩn). Nghiệm thu (Abnahme, § 640 BGB) là bước xác nhận hoàn thành đúng hợp đồng: chỉ sau khi nghiệm thu tiền công mới đến hạn, rủi ro mới chuyển sang bên đặt hàng và thời hiệu bảo hành mới bắt đầu chạy. Do lỗi nghiêm trọng (đèn nhấp nháy), công ty sự kiện có quyền từ chối nghiệm thu và yêu cầu sửa chữa khắc phục (Nacherfüllung).',
      'Wichtig für die volle Punktzahl: Werkvertrag (§ 631 BGB) benennen, Erfolg begründen, Rechtsfolgen der Abnahme (§ 640 BGB) nennen.',
      'Để đạt điểm tối đa IHK cần nêu đủ 3 ý: Gọi đúng tên Werkvertrag (§ 631 BGB), giải thích vì có cam kết thành quả, và nêu vai trò của Abnahme (đến hạn thanh toán + chuyển rủi ro + quyền từ chối nghiệm thu khi có lỗi lớn).'
    );

    -- Bài 1.2 (Liên kết)
    insert into public.lessons (subject_id, title_de, title_vn, level, sort_order, overview_de, overview_vn)
    values (
      s1_id,
      'Leistungsstörungen, Rücktritt & Stornierung im Eventbereich',
      'Sự cố thực hiện hợp đồng, Quyền rút lui & Hủy sự kiện (Stornierung)',
      'connected',
      2,
      'Aufbauend auf den Vertragsarten regelt das Leistungsstörungsrecht, was passiert, wenn eine Partei nicht, zu spät oder mangelhaft leistet. Besonders wichtig für Veranstaltungskaufleute sind das Fixgeschäft, Stornierungsstaffeln in AGB sowie Höhere Gewalt (Force Majeure).',
      'Nối tiếp kiến thức về các loại hợp đồng, luật về sự cố thực hiện hợp đồng quy định cách xử lý khi một bên không thực hiện, làm trễ hoặc làm lỗi. Đặc biệt quan trọng với nghề tổ chức sự kiện là hợp đồng cố định thời điểm (Fixgeschäft), bậc phí hủy trong AGB và trường hợp Bất khả kháng (Höhere Gewalt).'
    ) returning id into l2_id;

    insert into public.lesson_sections (lesson_id, sort_order, heading_de, heading_vn, content_de, content_vn, explanation_de, explanation_vn, example_de, example_vn, exam_tip_vn)
    values
    (
      l2_id, 1,
      '1. Absolutes Fixgeschäft & Unmöglichkeit (§ 275 BGB)',
      '1. Hợp đồng chốt cứng thời điểm tuyệt đối & Không thể thực hiện (§ 275 BGB)',
      'Ein absolutes Fixgeschäft liegt vor, wenn die Einhaltung der Leistungszeit so wesentlich ist, dass eine verspätete Leistung ihren Zweck vollständig verfehlt und keine Erfüllung mehr darstellt. Bei Verstreichen des Termins tritt automatisch Unmöglichkeit nach § 275 Abs. 1 BGB ein; eine Nachfristsetzung ist entbehrlich.',
      'Absolutes Fixgeschäft (giao dịch chốt cứng thời điểm tuyệt đối) xảy ra khi yếu tố thời gian quan trọng tới mức nếu giao trễ thì mục đích hoàn toàn vô nghĩa và không còn được coi là thực hiện hợp đồng nữa. Khi quá giờ hẹn, lập tức phát sinh tình trạng „Không thể thực hiện“ (Unmöglichkeit) theo § 275 khoản 1 BGB; không cần phải gia hạn thêm thời gian (Nachfrist).',
      'Ein Hochzeits-Catering am Tag nach der Hochzeit bringt niemandem mehr etwas. Deshalb musst du dem Caterer keine zweite Chance (Nachfrist) geben – der Vertrag ist sofort geplatzt und du kannst Schadensersatz verlangen.',
      'Tiệc cưới mà mang tới vào ngày hôm sau khi khách đã về hết thì hoàn toàn vô nghĩa. Vì thế bạn không cần phải viết thư gia hạn (Nachfrist) cho bên nấu tiệc nữa — hợp đồng coi như bất khả thi ngay lập tức và bạn có quyền đòi bồi thường thiệt hại.',
      'Der gebuchte Top-Act erscheint nicht zum festgelegten 21:00-Uhr-Slot auf dem Festival. Ein Auftritt am nächsten Tag nach Festivalende ist unmöglich (§ 275 BGB).',
      'Ca sĩ chính không xuất hiện ở khung giờ 21:00 của lễ hội âm nhạc. Việc biểu diễn bù vào ngày hôm sau khi lễ hội đã bế mạc là không thể (§ 275 BGB).',
      'Phân biệt kỹ: Giao dịch bình thường phải đặt "Nachfrist" (hạn chót bổ sung) trước khi hủy; còn "Absolutes Fixgeschäft" (rất đặc trưng của ngành Event) thì MIỄN đặt Nachfrist!'
    );

    insert into public.flashcards (lesson_id, subject_id, category, front_de, hint_vn, back_de, back_vn, example_de, example_vn)
    values
    (l2_id, s1_id, 'Recht', 'Absolutes Fixgeschäft', 'Giao dịch cố định thời điểm tuyệt đối', 'Geschäft, bei dem die Leistung nur exakt zum vereinbarten Termin sinnvoll ist. Verspätung führt sofort zur Unmöglichkeit (§ 275 BGB) ohne Nachfrist.', 'Giao dịch mà việc thực hiện chỉ có ý nghĩa đúng vào thời điểm đã hẹn. Trễ hẹn lập tức dẫn tới Unmöglichkeit (§ 275 BGB) mà không cần gia hạn.', 'Blumendekoration für eine einmalige Gala am Samstagabend.', 'Trang trí hoa tươi cho đêm Gala duy nhất tối thứ Bảy.'),
    (l2_id, s1_id, 'Praxis', 'Höhere Gewalt (Force Majeure)', 'Bất khả kháng', 'Unvorhersehbares, von außen einwirkendes Ereignis, das auch durch äußerste Sorgfalt nicht abgewendet werden kann (z. B. Orkan, behördliches Verbot).', 'Sự kiện bất ngờ tác động từ bên ngoài không thể lường trước hay ngăn chặn dù đã cẩn trọng tối đa (bão lớn, lệnh cấm đột xuất của chính quyền).', 'Behördliche Absage eines Open-Air-Konzerts wegen Unwetterwarnung.', 'Chính quyền yêu cầu hủy buổi hòa nhạc ngoài trời do cảnh báo bão.');

    insert into public.quiz_questions (lesson_id, sort_order, q_type, question_de, question_vn, options, correct_index, model_answer_de, model_answer_vn, explanation_de, explanation_vn)
    values
    (
      l2_id, 1, 'mc',
      'Warum ist bei einem absoluten Fixgeschäft im Eventbereich keine Nachfristsetzung erforderlich?',
      'Tại sao với giao dịch cố định thời điểm tuyệt đối (Absolutes Fixgeschäft) trong ngành sự kiện lại không cần đặt thời hạn bổ sung (Nachfrist)?',
      '[{"de":"Weil Eventagenturen generell von der Nachfrist befreit sind.","vn":"Vì các công ty sự kiện nói chung luôn được miễn đặt thời hạn bổ sung."},{"de":"Weil nach Verstreichen des Eventtermins Unmöglichkeit (§ 275 BGB) eintritt und der Leistungszweck entfallen ist.","vn":"Vì sau khi quá thời điểm sự kiện thì phát sinh tình trạng không thể thực hiện (§ 275 BGB) và mục đích đã mất hoàn toàn."},{"de":"Weil der Vertrag automatisch verlängert wird.","vn":"Vì hợp đồng sẽ tự động được gia hạn sang năm sau."},{"de":"Weil nur mündliche Verträge betroffen sind.","vn":"Vì chỉ áp dụng cho hợp đồng miệng."}]'::jsonb,
      1, '', '',
      'Die Leistung ist zeitlich nicht nachholbar; somit liegt sofort Unmöglichkeit gemäß § 275 BGB vor.',
      'Dịch vụ sự kiện không thể làm bù sau khi sự kiện kết thúc, do đó rơi ngay vào Unmöglichkeit theo § 275 BGB.'
    );

    -- Môn 2: Kaufmännische Steuerung & Kalkulation
    insert into public.subjects (title_de, title_vn, description_de, description_vn, sort_order)
    values (
      'Kaufmännische Steuerung & Kalkulation',
      'Quản trị kinh doanh & Tính giá sự kiện',
      'Kostenarten, Deckungsbeitragsrechnung, Break-even-Point und Budgetierung von Veranstaltungen.',
      'Phân loại chi phí, tính số dư đảm phí (Deckungsbeitrag), điểm hòa vốn (Break-even-Point) và lập ngân sách sự kiện.',
      2
    ) returning id into s2_id;

    insert into public.lessons (subject_id, title_de, title_vn, level, sort_order, overview_de, overview_vn)
    values (
      s2_id,
      'Fixkosten, Variable Kosten & Break-even-Point (Gewinnschwelle)',
      'Chi phí cố định, Chi phí biến đổi & Điểm hòa vốn (Break-even-Point)',
      'foundation',
      1,
      'Um ein Event wirtschaftlich erfolgreich zu planen, müssen fixe und variable Kosten sauber getrennt werden. Mithilfe des Deckungsbeitrags lässt sich exakt berechnen, wie viele Tickets verkauft werden müssen, um die Gewinnschwelle (Break-even-Point) zu erreichen.',
      'Để lên kế hoạch một sự kiện có lãi, bắt buộc phải tách bạch chi phí cố định và chi phí biến đổi. Nhờ công thức Số dư đảm phí (Deckungsbeitrag), ta tính được chính xác cần bán tối thiểu bao nhiêu vé để đạt Điểm hòa vốn (Break-even-Point).'
    ) returning id into l3_id;

    insert into public.lesson_sections (lesson_id, sort_order, heading_de, heading_vn, content_de, content_vn, explanation_de, explanation_vn, example_de, example_vn, exam_tip_vn)
    values
    (
      l3_id, 1,
      '1. Fixkosten (Kf) vs. Variable Kosten (Kv)',
      '1. Chi phí cố định (Kf) và Chi phí biến đổi (Kv)',
      'Fixkosten (Kf) fallen unabhängig von der Besucherzahl in konstanter Höhe an (z. B. Hallenmiete, Künstlergage, Grundbeleuchtung). Variable Kosten (Kv) verändern sich direkt proportional zur Anzahl der Teilnehmer bzw. verkauften Tickets (z. B. Catering pro Person, Einlassbänder, Ticketgebühren pro Stück).',
      'Chi phí cố định (Kf) phát sinh ở mức không đổi bất kể số lượng khách tham dự là bao nhiêu (VD: tiền thuê hội trường, cát-xê nghệ sĩ, dàn đèn cơ bản). Chi phí biến đổi (Kv) thay đổi tỷ lệ thuận trực tiếp theo số lượng người tham gia hoặc số vé bán ra (VD: suất ăn theo đầu người, vòng tay check-in, phí in vé mỗi chiếc).',
      'Merksatz: Kommen 0 Gäste oder 500 Gäste – musst du die Rechnung trotzdem voll bezahlen? Wenn Ja -> Fixkosten. Zahlst du nur pro Kopf/pro Ticket -> Variable Kosten.',
      'Câu thần chú nhớ nhanh: Dù có 0 khách hay 500 khách tới mà bạn vẫn phải móc hầu bao trả nguyên cục tiền đó -> Fixkosten. Chỉ tốn thêm tiền khi có thêm từng đầu khách/từng chiếc vé -> Variable Kosten.',
      'Konzert: Hallenmiete 4.000 € + Bandgage 2.000 € = Kf (6.000 €). Begrüßungsgetränk 5 €/Gast + Armband 1 €/Gast = kv (6 €/Ticket).',
      'Buổi hòa nhạc: Thuê hội trường 4.000 € + cát-xê ban nhạc 2.000 € = Kf (6.000 €). Đồ uống chào mừng 5 €/khách + vòng tay 1 €/khách = kv (6 €/vé).',
      'Cẩn thận bẫy đề thi IHK: Phí GEMA tính theo % doanh thu bán vé là chi phí biến đổi (variabel), còn phí thuê kỹ thuật viên theo ngày là chi phí cố định (fix).'
    ),
    (
      l3_id, 2,
      '2. Stückdeckungsbeitrag (db) & Break-even-Point (BEP)',
      '2. Số dư đảm phí đơn vị (db) & Công thức Điểm hòa vốn (BEP)',
      'Der Stückdeckungsbeitrag (db) ergibt sich aus dem Netto-Ticketpreis (p) abzüglich der variablen Stückkosten (kv): db = p - kv. Er zeigt an, wie viel Euro jedes verkaufte Ticket zur Deckung der Fixkosten beiträgt. Die Break-even-Menge (x_BEP) berechnet sich aus: x_BEP = Kf / db. Bei exakt dieser Menge gilt: Erlöse = Gesamtkosten (Gewinn = 0 €).',
      'Số dư đảm phí trên mỗi vé (Stückdeckungsbeitrag, ký hiệu db) bằng giá vé ròng chưa thuế (p) trừ đi chi phí biến đổi của 1 vé (kv): db = p - kv. Nó cho biết mỗi vé bán ra đóng góp bao nhiêu Euro để gánh chi phí cố định. Sản lượng hòa vốn (x_BEP) tính bằng: x_BEP = Kf / db. Tại đúng số vé này: Doanh thu = Tổng chi phí (Lợi nhuận = 0 €).',
      'Wenn ein Ticket netto 26 € kostet und 6 € variable Kosten pro Gast entstehen, bleiben 20 € (db) übrig, um den Berg an Fixkosten (6.000 €) abzutragen. 6.000 € / 20 € = 300 Tickets. Ab Ticket Nr. 301 machst du echten Gewinn!',
      'Nếu 1 vé giá ròng 26 € và tốn 6 € chi phí biến đổi cho mỗi khách, bạn còn dư 20 € (db) để trả dần cục nợ chi phí cố định 6.000 €. Lấy 6.000 € / 20 € = 300 vé. Từ tấm vé thứ 301 trở đi là bạn bắt đầu đút túi tiền lời thật sự!',
      'Kf = 6.000 €, p (netto) = 26 €, kv = 6 € -> db = 20 € -> BEP = 6.000 / 20 = 300 Tickets.',
      'Kf = 6.000 €, giá vé ròng p = 26 €, kv = 6 € -> db = 20 € -> Hòa vốn tại 6.000 / 20 = 300 vé.',
      'QUAN TRỌNG KHI TÍNH TOÁN IHK: 1) Luôn dùng giá vé NETTO (nếu đề cho Brutto 19% MwSt phải chia 1,19 trước!). 2) Nếu chia ra số lẻ (VD: 300,2 vé) BẮT BUỘC làm tròn LÊN thành 301 vé!'
    );

    insert into public.flashcards (lesson_id, subject_id, category, front_de, hint_vn, back_de, back_vn, example_de, example_vn)
    values
    (l3_id, s2_id, 'Formel', 'Stückdeckungsbeitrag (db)', 'Công thức số dư đảm phí 1 đơn vị', 'db = Netto-Verkaufspreis (p) - variable Stückkosten (kv). Betrag, den ein verkauftes Ticket zur Deckung der Fixkosten beiträgt.', 'db = Giá bán ròng (p) - Chi phí biến đổi 1 vé (kv). Khoản tiền mỗi vé bán ra góp vào để bù đắp chi phí cố định.', 'p = 30 € netto, kv = 8 € -> db = 22 €.', 'p = 30 € ròng, kv = 8 € -> db = 22 €.'),
    (l3_id, s2_id, 'Formel', 'Break-even-Point (Gewinnschwelle)', 'Công thức Điểm hòa vốn', 'x_BEP = Fixkosten (Kf) / Stückdeckungsbeitrag (db). Mindestabsatzmenge, bei der Erlöse = Gesamtkosten (Gewinn = 0). Bei Nachkommastellen immer aufrunden!', 'x_BEP = Chi phí cố định (Kf) / Số dư đảm phí đơn vị (db). Số vé tối thiểu để Doanh thu = Tổng chi phí. Ra số thập phân luôn làm tròn lên!', 'Kf = 10.000 €, db = 25 € -> BEP = 400 Tickets.', 'Kf = 10.000 €, db = 25 € -> Hòa vốn = 400 vé.');

    insert into public.quiz_questions (lesson_id, sort_order, q_type, question_de, question_vn, options, correct_index, model_answer_de, model_answer_vn, explanation_de, explanation_vn)
    values
    (
      l3_id, 1, 'mc',
      'Ein Club-Event hat Fixkosten von 4.500 €. Der Netto-Ticketpreis beträgt 20 €, die variablen Kosten pro Gast liegen bei 5 €. Wie hoch ist die Break-even-Menge?',
      'Một sự kiện Club có chi phí cố định 4.500 €. Giá vé ròng (Netto) là 20 €, chi phí biến đổi cho mỗi khách là 5 €. Số vé cần bán để hòa vốn là bao nhiêu?',
      '[{"de":"225 Tickets","vn":"225 vé"},{"de":"300 Tickets","vn":"300 vé"},{"de":"350 Tickets","vn":"350 vé"},{"de":"900 Tickets","vn":"900 vé"}]'::jsonb,
      1, '', '',
      'Zuerst db berechnen: 20 € - 5 € = 15 €. Danach BEP: 4.500 € / 15 € = 300 Tickets.',
      'Tính db trước: 20 € - 5 € = 15 €. Sau đó tính BEP: 4.500 € / 15 € = 300 vé.'
    ),
    (
      l3_id, 2, 'essay',
      'Rechenaufgabe: Für eine Firmen-Weihnachtsfeier betragen die Fixkosten 8.200 €. Der Ticketpreis beträgt 45 € netto, die variablen Kosten pro Gast liegen bei 12 €. Berechnen Sie den Stückdeckungsbeitrag (db) sowie die Break-even-Menge (auf ganze Tickets gerundet) und zeigen Sie den Rechenweg.',
      'Bài tập tính toán: Một tiệc Giáng sinh công ty có chi phí cố định 8.200 €. Giá vé là 45 € ròng (netto), chi phí biến đổi mỗi khách là 12 €. Hãy tính Số dư đảm phí đơn vị (db) và Số vé hòa vốn (làm tròn thành số vé nguyên) kèm trình bày các bước tính.',
      '[]'::jsonb, null,
      '1. Stückdeckungsbeitrag (db) = p - kv = 45 € - 12 € = 33 € pro Ticket. 2. Break-even-Menge (x_BEP) = Kf / db = 8.200 € / 33 € = 248,48 Tickets. 3. Kaufmännisch bzw. zur Kostendeckung aufrunden: Es müssen mindestens 249 Tickets verkauft werden, um die Gewinnschwelle zu überschreiten.',
      '1. Số dư đảm phí đơn vị (db) = 45 € - 12 € = 33 €/vé. 2. Sản lượng hòa vốn = 8.200 € / 33 € = 248,48 vé. 3. Bắt buộc làm tròn lên thành 249 vé (vì nếu bán 248 vé vẫn còn lỗ 16 €).',
      'Immer auf das Aufrunden bei halben Tickets achten (248,48 -> 249 Tickets).',
      'Luôn nhớ nguyên tắc làm tròn lên với số vé lẻ: 248,48 phải làm tròn lên 249 vé chứ không làm tròn xuống 248!'
    );

  end if;
end $$;
