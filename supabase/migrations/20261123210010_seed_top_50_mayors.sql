BEGIN;

-- Census Vintage 2025 city and town estimates, July 1, 2025 (city populations).
-- https://www.census.gov/data/tables/time-series/demo/popest/2020s-total-cities-and-towns.html
-- Officeholders checked November 23, 2026. Use the sitting mayor through the end of their term.
DO $$
DECLARE
  entry record;
  existing_id uuid;
  published_id uuid;
BEGIN
  FOR entry IN SELECT * FROM (VALUES
    ('New York City', 'NY', 8584629, 'Zohran Mamdani', 'https://www.nyc.gov/mayors-office', 'cityhall.nyc.gov', 'https://www.nyc.gov/main/your-government', NULL),
    ('Los Angeles', 'CA', 3869089, 'Karen Bass', 'https://mayor.lacity.gov/', NULL, NULL, 'B001270'),
    ('Chicago', 'IL', 2731585, 'Brandon Johnson', 'https://chicago.gov/MayorsOffice', NULL, NULL, NULL),
    ('Houston', 'TX', 2397315, 'John Whitmire', 'https://www.houstontx.gov/mayor', 'houstontx.gov', NULL, NULL),
    ('Phoenix', 'AZ', 1665481, 'Kate Gallego', 'https://www.phoenix.gov/administration/mayor.html', 'phoenix.gov', NULL, NULL),
    ('Philadelphia', 'PA', 1574281, 'Cherelle Parker', 'https://www.phila.gov/departments/mayor/', 'phila.gov', NULL, NULL),
    ('San Antonio', 'TX', 1548422, 'Gina Ortiz Jones', 'https://www.sa.gov/Directory/Departments/Mayor-Council/Mayor/Biography', 'sanantonio.gov', NULL, NULL),
    ('San Diego', 'CA', 1406106, 'Todd Gloria', 'https://www.sandiego.gov/mayor', 'sandiego.gov', NULL, NULL),
    ('Dallas', 'TX', 1329491, 'Eric Johnson', 'https://dallascityhall.com/government/citymayor/Pages/biography.aspx', NULL, NULL, NULL),
    ('Fort Worth', 'TX', 1028117, 'Mattie Parker', 'https://www.fortworthtexas.gov/government/elected-officials/mattie-parker', 'fortworthtexas.gov', NULL, NULL),
    ('Jacksonville', 'FL', 1017689, 'Donna Deegan', 'https://www.jacksonville.gov/mayor', NULL, NULL, NULL),
    ('Austin', 'TX', 1002632, 'Kirk Watson', 'https://www.austintexas.gov/mayor', 'austintexas.gov', NULL, NULL),
    ('San Jose', 'CA', 989814, 'Matt Mahan', 'https://www.sanjoseca.gov/your-government/departments-offices/mayor-and-city-council', 'sanjoseca.gov', NULL, NULL),
    ('Charlotte', 'NC', 964784, 'Rob Harrington', 'https://www.charlottenc.gov/City-Government/Leadership/Mayor/Meet-the-Mayor', 'charlottenc.gov', NULL, NULL),
    ('Columbus', 'OH', 938396, 'Andy Ginther', 'https://www.columbus.gov/Government/Mayors-Office/About-Mayor-Andrew-J.-Ginther', 'columbus.gov', NULL, NULL),
    ('Indianapolis', 'IN', 901116, 'Joe Hogsett', 'https://www.indy.gov/activity/mayor-joe-hogsett', 'indy.gov', NULL, NULL),
    ('San Francisco', 'CA', 826079, 'Daniel Lurie', 'https://www.sf.gov/profile/daniel-lurie', NULL, NULL, NULL),
    ('Seattle', 'WA', 784777, 'Katie Wilson', 'https://seattle.gov/mayor', 'seattle.gov', NULL, NULL),
    ('Denver', 'CO', 740613, 'Mike Johnston', 'https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Mayors-Office', NULL, NULL, NULL),
    ('Nashville', 'TN', 721074, 'Freddie O''Connell', 'https://www.nashville.gov/departments/mayor', 'nashville.gov', NULL, NULL),
    ('Oklahoma City', 'OK', 719849, 'David Holt', 'https://www.okc.gov/Government/Elected-Officials/Mayor', 'okc.gov', NULL, NULL),
    ('Washington, D.C.', 'DC', 693645, 'Muriel Bowser', 'https://mayor.dc.gov/', 'dc.gov', NULL, NULL),
    ('El Paso', 'TX', 683012, 'Renard Johnson', 'https://www.elpasotexas.gov/government/mayor', 'elpasotexas.gov', NULL, NULL),
    ('Las Vegas', 'NV', 679817, 'Shelley Berkley', 'https://www.lasvegasnevada.gov/Government/Mayor-City-Council/Mayor', 'lasvegasnevada.gov', NULL, NULL),
    ('Boston', 'MA', 672973, 'Michelle Wu', 'https://www.boston.gov/departments/mayors-office/michelle-wu', 'boston.gov', NULL, NULL),
    ('Detroit', 'MI', 649095, 'Mary Sheffield', 'https://detroitmi.gov/government/mayors-office/mayor', 'detroitmi.gov', NULL, NULL),
    ('Louisville', 'KY', 641962, 'Craig Greenberg', 'https://louisvilleky.gov/government/mayor-craig-greenberg', 'louisvilleky.gov', NULL, NULL),
    ('Portland', 'OR', 635109, 'Keith Wilson', 'https://www.portland.gov/mayor', NULL, NULL, NULL),
    ('Memphis', 'TN', 609647, 'Paul Young', 'https://memphistn.gov/government-mayor/', 'memphistn.gov', NULL, NULL),
    ('Baltimore', 'MD', 569997, 'Brandon Scott', 'https://mayor.baltimorecity.gov/', 'baltimorecity.gov', NULL, NULL),
    ('Milwaukee', 'WI', 562407, 'Cavalier Johnson', 'https://city.milwaukee.gov/mayor', NULL, NULL, NULL),
    ('Albuquerque', 'NM', 556588, 'Tim Keller', 'https://www.cabq.gov/mayor', 'cabq.gov', NULL, NULL),
    ('Fresno', 'CA', 555549, 'Jerry Dyer', 'https://www.fresno.gov/mayor/', 'fresno.gov', NULL, NULL),
    ('Tucson', 'AZ', 548371, 'Regina Romero', 'https://www.tucsonaz.gov/Government/Mayor-Council-and-City-Manager/Mayor-Regina-Romero', 'tucsonaz.gov', NULL, NULL),
    ('Sacramento', 'CA', 536449, 'Kevin McCarty', 'https://www.cityofsacramento.gov/mayor-council/mayor/biography-of-mayor-mccarty', NULL, NULL, NULL),
    ('Atlanta', 'GA', 529110, 'Andre Dickens', 'https://www.atlantaga.gov/government/mayor-s-office/meet-the-mayor', 'atlantaga.gov', NULL, NULL),
    ('Kansas City', 'MO', 521220, 'Quinton Lucas', 'https://www.kcmo.gov/city-hall/city-officials/mayor-quinton-lucas', NULL, NULL, NULL),
    ('Mesa', 'AZ', 513656, 'Mark Freeman', 'https://www.mesaaz.gov/Government/Mayor-City-Council/Mayor-Mark-Freeman', 'mesaaz.gov', NULL, NULL),
    ('Raleigh', 'NC', 506306, 'Janet Cowell', 'https://raleighnc.gov/city-council/janet-cowell', 'raleighnc.gov', NULL, NULL),
    ('Colorado Springs', 'CO', 494743, 'Yemi Mobolade', 'https://coloradosprings.gov/mayor', 'coloradosprings.gov', NULL, NULL),
    ('Miami', 'FL', 489812, 'Eileen Higgins', 'https://www.miami.gov/My-Government/City-Officials/Mayor-Eileen-Higgins', NULL, NULL, NULL),
    ('Omaha', 'NE', 488797, 'John Ewing Jr.', 'https://mayors-office.cityofomaha.org/', NULL, 'https://clerk.omaha.gov/wp-content/uploads/images/RES-2026-0892.pdf', NULL),
    ('Virginia Beach', 'VA', 453737, 'Bobby Dyer', 'https://virginiabeach.gov/city-hall/mayors-office', NULL, NULL, NULL),
    ('Long Beach', 'CA', 450469, 'Rex Richardson', 'https://www.longbeach.gov/mayor/about/', 'longbeach.gov', NULL, NULL),
    ('Oakland', 'CA', 440838, 'Barbara Lee', 'https://www.oaklandca.gov/Government/City-Council-Leadership/Leadership/Office-of-the-Mayor/Biography', 'oaklandca.gov', NULL, 'L000551'),
    ('Minneapolis', 'MN', 430324, 'Jacob Frey', 'https://www.minneapolismn.gov/government/mayor/about-the-mayor/', 'minneapolismn.gov', NULL, NULL),
    ('Bakersfield', 'CA', 422165, 'Karen Goh', 'https://www.bakersfieldcity.us/', NULL, 'https://admin.cdn.sos.ca.gov/ca-roster/2026/cities-towns.pdf', NULL),
    ('Tulsa', 'OK', 416209, 'Monroe Nichols', 'https://cityoftulsa.org/mayor/about-mayor-nichols/', NULL, NULL, NULL),
    ('Tampa', 'FL', 413554, 'Jane Castor', 'https://www.tampa.gov/mayor', 'tampa.gov', NULL, NULL),
    ('Aurora', 'CO', 410053, 'Mike Coffman', 'https://www.auroragov.org/city_hall/mayor___city_council/mayor___council_members/mike_coffman', NULL, NULL, 'C001077')
  ) AS roster(city, state, population, full_name, official_url, email_domain, evidence_url, bioguide_id)
  LOOP
    -- Preserve the canonical profile when the reviewed person has a prior
    -- congressional record in WhyTho.
    existing_id := NULL;
    IF entry.bioguide_id IS NOT NULL THEN
      SELECT DISTINCT coalesce(p.canonical_politician_id, p.id) INTO existing_id
      FROM public.politicians p
      WHERE p.bioguide_id = entry.bioguide_id AND NOT p.is_test;
    END IF;
    published_id := public.publish_reviewed_mayor(
      entry.full_name, entry.city, entry.state, entry.official_url, existing_id, NULL,
      entry.email_domain, entry.evidence_url
    );
    UPDATE public.politicians SET mayor_city_population = entry.population WHERE id = published_id;
  END LOOP;
END;
$$;

COMMIT;
