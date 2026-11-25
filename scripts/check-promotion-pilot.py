"""Recheck the first housing pilot. Downloads only the listed public evidence."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree

from PIL import Image, ImageOps, ImageDraw
from pypdf import PdfReader

COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/'
PILOT = [
    ('A000055', 'Robert B. Aderholt', 'Yea', 'f/ff/Robert_Aderholt_official_photo.jpg', 'US House Office of Photography'),
    ('B001316', 'Eric Burlison', 'Nay', '0/00/Eric_Burlison_portrait_118th.jpg', 'House Creative Services'),
    ('W000817', 'Elizabeth Warren', 'Warren', '6/6a/Elizabeth_Warren,_official_portrait,_114th_Congress.jpg', 'United States Senate'),
    ('S001184', 'Tim Scott', 'Scott (SC)', '9/9e/Tim_Scott,_official_portrait,_113th_Congress.jpg', 'U.S. Senate Photographic Studio / Renee Bouchard'),
]
HOUSE = 'https://clerk.house.gov/evs/2026/roll224.xml'
SENATE = 'https://www.govinfo.gov/content/pkg/CREC-2026-06-18/pdf/CREC-2026-06-18-pt1-PgS2917.pdf'
LAW = 'https://www.govinfo.gov/content/pkg/PLAW-119publ101/html/PLAW-119publ101.htm'


def get(url, dst):
    subprocess.run([
        'curl', '-fsSL', '--max-time', '25', '--max-filesize', '8000000',
        '--proto', '=https', '--proto-redir', '=https',
        '--user-agent', 'WhyTho editorial evidence check (support@whytho.us)',
        '--output', str(dst), url,
    ], check=True)
    return dst


def must(condition, description):
    if not condition:
        raise ValueError(description)


def hashes(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path, help='New output directory')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        scratch = Path(tmp)
        house = ElementTree.parse(get(HOUSE, scratch / 'house.xml'))
        must(
            [house.findtext('vote-metadata/' + field) for field in ('legis-num', 'action-date', 'rollcall-num')]
            == ['H R 6644', '23-Jun-2026', '224']
            and 'Concur in Senate Adt' in house.findtext('vote-metadata/vote-question', ''),
            'Unexpected House vote metadata',
        )
        senate = '\n'.join(p.extract_text() for p in PdfReader(get(SENATE, scratch / 'senate.pdf')).pages)
        must(re.search(r'June 18, 2026', senate) and 'H.R. 6644' in senate and 'CLOTURE MOTION' in senate,
             'Unexpected Senate vote metadata')
        yea_list = re.search(r'Rollcall Vote No\. 180 Leg\..*?YEAS[^\n]*\n(.*?)\nNAYS', senate, re.S)
        must(yea_list, 'Official Senate yea list not found')
        yea_names = {line.strip() for line in yea_list.group(1).splitlines()}
        law = get(LAW, scratch / 'law.htm').read_text()
        must('July 11, 2026 -  [H.R. 6644]' in law, 'Enacted law did not match the pilot bill and date')
        rows = []
        sheet = Image.new('RGB', (1080, 345), 'white')
        draw = ImageDraw.Draw(sheet)
        for index, (person_id, name, vote, file_path, credit) in enumerate(PILOT):
            if index < 2:
                match = house.find(f".//recorded-vote/legislator[@name-id='{person_id}']/..")
                must(match is not None and match.findtext('vote') == vote, f'Unexpected vote for {name}')
            else:
                must(vote in yea_names, f'Missing Senate yea vote for {name}')
            asset = get(COMMONS + file_path, args.output / f'{person_id}.jpg')
            filename = urlsplit(COMMONS + file_path).path.rsplit('/', 1)[1]
            record = 'https://commons.wikimedia.org/wiki/File:' + filename
            with Image.open(asset) as source:
                must(source.format == 'JPEG' and source.width * source.height <= 20_000_000, f'Invalid portrait for {name}')
                oriented = ImageOps.exif_transpose(source)
                width, height = oriented.size
                must(width >= 400 and height >= 500, f'Portrait below minimum for {name}')
                oriented.thumbnail((244, 306))
                offset = index * 270
                sheet.paste(oriented, (offset + (270 - oriented.width) // 2, 0))
                draw.text((offset + 14, 318), name, fill='black')
            rows.append(dict(id=person_id, name=name, vote='Yea' if index >= 2 else vote,
                             source=record, image=COMMONS + file_path, credit=credit,
                             width=width, height=height, bytes=asset.stat().st_size, sha256=hashes(asset)))
        sheet.save(args.output / 'portrait-review.jpg')
        (args.output / 'checks.json').write_text(json.dumps({
            'vote_sources': [HOUSE, SENATE, LAW],
            'officials': rows,
        }, indent=2) + '\n')
        print(f'Verified four votes and four portrait files. Evidence saved to {args.output}.')


if __name__ == '__main__':
    main()
