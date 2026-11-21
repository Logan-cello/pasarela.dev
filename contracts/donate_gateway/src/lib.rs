#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    token::Client as TokenClient, Address, Env, String, Vec,
};

pub const MAX_HISTORY: u32 = 50;

#[derive(Clone)]
#[contracttype]
pub struct Sign {
    pub owner: Address,
    pub receiver: Address,
    pub title: String,
    pub amounts: Vec<i128>,
    pub active: bool,
    pub custom_enabled: bool,
    pub custom_min: i128,
    pub custom_max: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct Donation {
    pub donor: Address,
    pub receiver: Address,
    pub sign_id: u32,
    pub amount: i128,
    pub token: Address,
    pub message: String,
    pub ledger: u32,
    pub timestamp: u64,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    SignCount,
    DonationCount,
    Sign(u32),
    SignTotal(u32),
    SignDonationCount(u32),
    SignDonation(u32, u32),
    DonorDonationCount(Address),
    DonorDonation(Address, u32),
    Donation(u32),
}

#[contracterror]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Error {
    NotInitialized = 1,
    InvalidAmount = 2,
    InvalidTitle = 3,
    InvalidAmounts = 4,
    SignNotFound = 5,
    SignInactive = 6,
    WrongToken = 7,
    Unauthorized = 8,
    InvalidCustomRange = 9,
    InvalidMessage = 10,
    InvalidLimit = 11,
}

#[contract]
pub struct DonateGateway;

fn validate_amounts(env: &Env, amounts: &Vec<i128>) -> Result<(), Error> {
    if amounts.len() == 0 || amounts.len() > 8 {
        return Err(Error::InvalidAmounts);
    }
    for amount in amounts.iter() {
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
    }
    let mut seen = Vec::<i128>::new(env);
    for amount in amounts.iter() {
        if seen.contains(amount) {
            return Err(Error::InvalidAmounts);
        }
        seen.push_back(amount);
    }
    Ok(())
}

fn validate_custom(enabled: bool, minimum: i128, maximum: i128) -> Result<(), Error> {
    if enabled && (minimum <= 0 || maximum < minimum) {
        return Err(Error::InvalidCustomRange);
    }
    Ok(())
}

fn clamp_limit(limit: u32) -> u32 {
    if limit == 0 { 1 } else if limit > MAX_HISTORY { MAX_HISTORY } else { limit }
}

#[contractimpl]
impl DonateGateway {
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::SignCount, &0u32);
        env.storage().instance().set(&DataKey::DonationCount, &0u32);
        Ok(())
    }

    pub fn create_sign(
        env: Env,
        owner: Address,
        receiver: Address,
        title: String,
        amounts: Vec<i128>,
    ) -> Result<u32, Error> {
        owner.require_auth();
        if title.len() == 0 || title.len() > 80 {
            return Err(Error::InvalidTitle);
        }
        validate_amounts(&env, &amounts)?;
        let id: u32 = env.storage().instance().get(&DataKey::SignCount).unwrap_or(0);
        let sign = Sign {
            owner,
            receiver,
            title,
            amounts,
            active: true,
            custom_enabled: false,
            custom_min: 0,
            custom_max: 0,
        };
        env.storage().persistent().set(&DataKey::Sign(id), &sign);
        env.storage().persistent().set(&DataKey::SignTotal(id), &0i128);
        env.storage().persistent().set(&DataKey::SignDonationCount(id), &0u32);
        env.storage().instance().set(&DataKey::SignCount, &(id + 1));
        Ok(id)
    }

    pub fn create_sign_advanced(
        env: Env,
        owner: Address,
        receiver: Address,
        title: String,
        amounts: Vec<i128>,
        custom_enabled: bool,
        custom_min: i128,
        custom_max: i128,
    ) -> Result<u32, Error> {
        owner.require_auth();
        if title.len() == 0 || title.len() > 80 {
            return Err(Error::InvalidTitle);
        }
        validate_amounts(&env, &amounts)?;
        validate_custom(custom_enabled, custom_min, custom_max)?;
        let id: u32 = env.storage().instance().get(&DataKey::SignCount).unwrap_or(0);
        let sign = Sign {
            owner,
            receiver,
            title,
            amounts,
            active: true,
            custom_enabled,
            custom_min,
            custom_max,
        };
        env.storage().persistent().set(&DataKey::Sign(id), &sign);
        env.storage().persistent().set(&DataKey::SignTotal(id), &0i128);
        env.storage().persistent().set(&DataKey::SignDonationCount(id), &0u32);
        env.storage().instance().set(&DataKey::SignCount, &(id + 1));
        Ok(id)
    }

    pub fn set_sign_active(
        env: Env,
        owner: Address,
        sign_id: u32,
        active: bool,
    ) -> Result<(), Error> {
        owner.require_auth();
        let mut sign: Sign = env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)?;
        if sign.owner != owner {
            return Err(Error::Unauthorized);
        }
        sign.active = active;
        env.storage().persistent().set(&DataKey::Sign(sign_id), &sign);
        Ok(())
    }

    pub fn update_sign_amounts(
        env: Env,
        owner: Address,
        sign_id: u32,
        amounts: Vec<i128>,
        custom_enabled: bool,
        custom_min: i128,
        custom_max: i128,
    ) -> Result<(), Error> {
        owner.require_auth();
        let mut sign: Sign = env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)?;
        if sign.owner != owner {
            return Err(Error::Unauthorized);
        }
        validate_amounts(&env, &amounts)?;
        validate_custom(custom_enabled, custom_min, custom_max)?;
        sign.amounts = amounts;
        sign.custom_enabled = custom_enabled;
        sign.custom_min = custom_min;
        sign.custom_max = custom_max;
        env.storage().persistent().set(&DataKey::Sign(sign_id), &sign);
        Ok(())
    }

    pub fn donate(
        env: Env,
        donor: Address,
        sign_id: u32,
        amount: i128,
        message: String,
    ) -> Result<u32, Error> {
        donor.require_auth();
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let sign: Sign = env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)?;
        if !sign.active {
            return Err(Error::SignInactive);
        }
        if message.len() > 180 {
            return Err(Error::InvalidMessage);
        }

        let preset = sign.amounts.contains(amount);
        let custom = sign.custom_enabled && amount >= sign.custom_min && amount <= sign.custom_max;
        if !preset && !custom {
            return Err(Error::InvalidAmount);
        }

        let token: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::WrongToken)?;
        TokenClient::new(&env, &token).transfer(&donor, &sign.receiver, &amount);

        let id: u32 = env.storage().instance().get(&DataKey::DonationCount).unwrap_or(0);
        let donation = Donation {
            donor: donor.clone(),
            receiver: sign.receiver,
            sign_id,
            amount,
            token: token.clone(),
            message,
            ledger: env.ledger().sequence(),
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Donation(id), &donation);
        env.storage().instance().set(&DataKey::DonationCount, &(id + 1));

        let sign_total: i128 = env.storage().persistent().get(&DataKey::SignTotal(sign_id)).unwrap_or(0);
        env.storage().persistent().set(&DataKey::SignTotal(sign_id), &(sign_total.checked_add(amount).ok_or(Error::InvalidAmount)?));

        let sign_count: u32 = env.storage().persistent().get(&DataKey::SignDonationCount(sign_id)).unwrap_or(0);
        env.storage().persistent().set(&DataKey::SignDonation(sign_id, sign_count), &id);
        env.storage().persistent().set(&DataKey::SignDonationCount(sign_id), &(sign_count + 1));

        let donor_count: u32 = env.storage().persistent().get(&DataKey::DonorDonationCount(donor.clone())).unwrap_or(0);
        env.storage().persistent().set(&DataKey::DonorDonation(donor.clone(), donor_count), &id);
        env.storage().persistent().set(&DataKey::DonorDonationCount(donor), &(donor_count + 1));

        env.events().publish((symbol_short!("donated"), sign_id), (id, amount));
        Ok(id)
    }

    pub fn get_sign(env: Env, sign_id: u32) -> Result<Sign, Error> {
        env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)
    }

    pub fn get_donation(env: Env, donation_id: u32) -> Option<Donation> {
        env.storage().persistent().get(&DataKey::Donation(donation_id))
    }

    pub fn get_sign_total(env: Env, sign_id: u32) -> Result<i128, Error> {
        if !env.storage().persistent().has(&DataKey::Sign(sign_id)) {
            return Err(Error::SignNotFound);
        }
        Ok(env.storage().persistent().get(&DataKey::SignTotal(sign_id)).unwrap_or(0))
    }

    pub fn get_sign_donations(env: Env, sign_id: u32, offset: u32, limit: u32) -> Result<Vec<Donation>, Error> {
        if !env.storage().persistent().has(&DataKey::Sign(sign_id)) {
            return Err(Error::SignNotFound);
        }
        let limit = clamp_limit(limit);
        let count: u32 = env.storage().persistent().get(&DataKey::SignDonationCount(sign_id)).unwrap_or(0);
        let mut result = Vec::new(&env);
        let mut position = offset;
        while position < count && result.len() < limit {
            if let Some(donation_id) = env.storage().persistent().get::<DataKey, u32>(&DataKey::SignDonation(sign_id, position)) {
                if let Some(donation) = env.storage().persistent().get(&DataKey::Donation(donation_id)) {
                    result.push_back(donation);
                }
            }
            position += 1;
        }
        Ok(result)
    }

    pub fn get_donor_donations(env: Env, donor: Address, offset: u32, limit: u32) -> Vec<Donation> {
        let limit = clamp_limit(limit);
        let count: u32 = env.storage().persistent().get(&DataKey::DonorDonationCount(donor.clone())).unwrap_or(0);
        let mut result = Vec::new(&env);
        let mut position = offset;
        while position < count && result.len() < limit {
            if let Some(donation_id) = env.storage().persistent().get::<DataKey, u32>(&DataKey::DonorDonation(donor.clone(), position)) {
                if let Some(donation) = env.storage().persistent().get(&DataKey::Donation(donation_id)) {
                    result.push_back(donation);
                }
            }
            position += 1;
        }
        result
    }

    pub fn sign_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::SignCount).unwrap_or(0)
    }

    pub fn donation_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::DonationCount).unwrap_or(0)
    }

    pub fn token(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Token).ok_or(Error::WrongToken)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;

    #[contract]
    struct MockToken;

    #[contractimpl]
    impl MockToken {
        pub fn balance(env: Env, account: Address) -> i128 {
            env.storage().persistent().get(&account).unwrap_or(0)
        }

        pub fn mint(env: Env, to: Address, amount: i128) {
            let balance = Self::balance(env.clone(), to.clone());
            env.storage().persistent().set(&to, &(balance + amount));
        }

        pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
            from.require_auth();
            let from_balance = Self::balance(env.clone(), from.clone());
            assert!(from_balance >= amount);
            env.storage().persistent().set(&from, &(from_balance - amount));
            let to_balance = Self::balance(env.clone(), to.clone());
            env.storage().persistent().set(&to, &(to_balance + amount));
        }
    }

    fn setup() -> (Env, Address, DonateGatewayClient<'static>) {
        let env = Env::default();
        let gateway = env.register(DonateGateway, ());
        let token = env.register(MockToken, ());
        env.mock_all_auths();
        let client = DonateGatewayClient::new(&env, &gateway);
        let admin = Address::generate(&env);
        client.initialize(&admin, &token);
        (env, token, client)
    }

    #[test]
    fn creates_sign_and_supports_get_sign() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        let amounts = Vec::from_array(&env, [10i128, 25i128]);
        let id = client.create_sign(&owner, &receiver, &String::from_str(&env, "Creator"), &amounts);
        assert_eq!(id, 0);
        assert_eq!(client.sign_count(), 1);
        assert_eq!(client.get_sign(&0).receiver, receiver);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #2)")]
    fn rejects_zero_preset_amount() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "bad"),
            &Vec::from_array(&env, [0i128]),
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn rejects_duplicate_preset_amounts() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "duplicate"),
            &Vec::from_array(&env, [10i128, 10i128]),
        );
    }

    #[test]
    fn test_token_donation_updates_totals_and_filters() {
        let (env, token, client) = setup();
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign_advanced(
            &owner,
            &receiver,
            &String::from_str(&env, "Café"),
            &Vec::from_array(&env, [100i128, 500i128]),
            &true,
            &25i128,
            &1000i128,
        );

        let token_client = MockTokenClient::new(&env, &token);
        token_client.mint(&donor, &2000);
        let donation_id = client.donate(&donor, &id, &250, &String::from_str(&env, "Gracias"));

        assert_eq!(donation_id, 0);
        assert_eq!(client.get_sign_total(&id), 250);
        assert_eq!(token_client.balance(&donor), 1750);
        assert_eq!(token_client.balance(&receiver), 250);

        let sign_history = client.get_sign_donations(&id, &0, &50);
        assert_eq!(sign_history.len(), 1);
        assert_eq!(sign_history.first().unwrap().amount, 250);

        let donor_history = client.get_donor_donations(&donor, &0, &50);
        assert_eq!(donor_history.len(), 1);
        assert_eq!(donor_history.first().unwrap().donor, donor);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #6)")]
    fn inactive_sign_rejects_donation() {
        let (env, token, client) = setup();
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "Tienda"),
            &Vec::from_array(&env, [100i128]),
        );
        client.set_sign_active(&owner, &id, &false);
        MockTokenClient::new(&env, &token).mint(&donor, &1000);
        client.donate(&donor, &id, &100, &String::from_str(&env, "hola"));
    }

    #[test]
    #[should_panic]
    fn rejects_zero_amount() {
        let (env, token, client) = setup();
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign_advanced(
            &owner,
            &receiver,
            &String::from_str(&env, "Rango"),
            &Vec::from_array(&env, [100i128]),
            &true,
            &50i128,
            &500i128,
        );
        MockTokenClient::new(&env, &token).mint(&donor, &1000);
        client.donate(&donor, &id, &0, &String::from_str(&env, "cero"));
    }

    #[test]
    #[should_panic]
    fn rejects_amount_below_custom_minimum() {
        let (env, token, client) = setup();
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign_advanced(
            &owner, &receiver, &String::from_str(&env, "Rango"),
            &Vec::from_array(&env, [100i128]), &true, &50i128, &500i128,
        );
        MockTokenClient::new(&env, &token).mint(&donor, &1000);
        client.donate(&donor, &id, &49, &String::from_str(&env, "bajo"));
    }

    #[test]
    #[should_panic]
    fn rejects_amount_above_custom_maximum() {
        let (env, token, client) = setup();
        let owner = Address::generate(&env);
        let donor = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign_advanced(
            &owner, &receiver, &String::from_str(&env, "Rango"),
            &Vec::from_array(&env, [100i128]), &true, &50i128, &500i128,
        );
        MockTokenClient::new(&env, &token).mint(&donor, &1000);
        client.donate(&donor, &id, &501, &String::from_str(&env, "alto"));
    }

    #[test]
    fn owner_updates_state_and_amounts() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "Propio"),
            &Vec::from_array(&env, [100i128]),
        );

        client.update_sign_amounts(
            &owner,
            &id,
            &Vec::from_array(&env, [200i128, 300i128]),
            &true,
            &100i128,
            &1000i128,
        );
        let sign = client.get_sign(&id);
        assert_eq!(sign.amounts, Vec::from_array(&env, [200i128, 300i128]));
        assert!(sign.custom_enabled);

        client.set_sign_active(&owner, &id, &false);
        assert!(!client.get_sign(&id).active);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn third_party_cannot_change_state() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let third_party = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "Propio"),
            &Vec::from_array(&env, [100i128]),
        );
        client.set_sign_active(&third_party, &id, &true);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #8)")]
    fn third_party_cannot_update_amounts() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let third_party = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "Propio"),
            &Vec::from_array(&env, [100i128]),
        );
        client.update_sign_amounts(
            &third_party,
            &id,
            &Vec::from_array(&env, [999i128]),
            &false,
            &0i128,
            &0i128,
        );
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #9)")]
    fn rejects_invalid_custom_range() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        client.create_sign_advanced(
            &owner,
            &receiver,
            &String::from_str(&env, "Invalido"),
            &Vec::from_array(&env, [100i128]),
            &true,
            &500i128,
            &100i128,
        );
    }

    #[test]
    fn history_is_bounded() {
        let (env, _token, client) = setup();
        let owner = Address::generate(&env);
        let receiver = Address::generate(&env);
        let id = client.create_sign(
            &owner,
            &receiver,
            &String::from_str(&env, "Limite"),
            &Vec::from_array(&env, [100i128]),
        );
        let history = client.get_sign_donations(&id, &0, &500);
        assert_eq!(history.len(), 0);
    }
}
