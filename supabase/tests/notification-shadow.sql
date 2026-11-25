\ir notification-preferences.sql
CREATE TYPE public.question_status AS ENUM('active','removed','merged');
CREATE TABLE public.questions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid NOT NULL REFERENCES public.politicians,
 status public.question_status DEFAULT 'active',source text DEFAULT 'user',is_seeded boolean DEFAULT false,submitted_by uuid REFERENCES auth.users,created_at timestamptz DEFAULT now(),x_post_id uuid);
CREATE TABLE public.answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid REFERENCES public.questions,is_draft boolean DEFAULT false,is_ai_generated boolean DEFAULT false);
\ir ../migrations/20261119000100_question_notification_events.sql
SET ROLE service_role;
SELECT public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','daily','America/New_York','politician-question-notices-v1');
RESET ROLE;
INSERT INTO public.questions(id,politician_id,submitted_by,created_at)
VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',now()-interval '1 hour'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',now()-interval '30 minutes');
UPDATE public.questions SET status='removed' WHERE id='20000000-0000-4000-8000-000000000002';
