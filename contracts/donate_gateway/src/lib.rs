#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token::Client as TokenClient,
    Address, Env, String, Vec,
};

#[derive(Clone)]
#[contracttype]
pub struct Sign {
    pub owner: Address,
    pub receiver: Address,
    pub title: String,
    pub amounts: Vec<i128>,
    pub active: bool,
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
}

#[contract]
pub struct DonateGateway;

#[contractimpl]
impl DonateGateway {
    /// One-time setup. `token` is a Soroban token contract (SAC or compatible token).
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
        if title.len() == 0 || title.len() > 80 { return Err(Error::InvalidTitle); }
        if amounts.len() == 0 || amounts.len() > 8 { return Err(Error::InvalidAmounts); }
        for amount in amounts.iter() {
            if amount <= 0 { return Err(Error::InvalidAmount); }
        }
        let id: u32 = env.storage().instance().get(&DataKey::SignCount).unwrap_or(0);
        let sign = Sign { owner, receiver, title, amounts, active: true };
        env.storage().persistent().set(&DataKey::Sign(id), &sign);
        env.storage().instance().set(&DataKey::SignCount, &(id + 1));
        Ok(id)
    }

    pub fn set_sign_active(env: Env, owner: Address, sign_id: u32, active: bool) -> Result<(), Error> {
        owner.require_auth();
        let mut sign: Sign = env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)?;
        if sign.owner != owner { return Err(Error::SignNotFound); }
        sign.active = active;
        env.storage().persistent().set(&DataKey::Sign(sign_id), &sign);
        Ok(())
    }

    /// Pulls `amount` from donor using allowance/authorization and sends it to the sign receiver.
    /// For a SAC, the donor must authorize this contract as spender in a separate token tx.
    pub fn donate(
        env: Env,
        donor: Address,
        sign_id: u32,
        amount: i128,
        message: String,
    ) -> Result<u32, Error> {
        donor.require_auth();
        if amount <= 0 { return Err(Error::InvalidAmount); }
        let sign: Sign = env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)?;
        if !sign.active { return Err(Error::SignInactive); }
        if message.len() > 180 { return Err(Error::InvalidTitle); }
        let token: Address = env.storage().instance().get(&DataKey::Token).ok_or(Error::WrongToken)?;
        let client = TokenClient::new(&env, &token);
        // The donor's Soroban authorization is propagated to the nested token transfer.
        // This keeps the demo to one wallet signature and avoids a separate allowance tx.
        client.transfer(&donor, &sign.receiver, &amount);
        let id: u32 = env.storage().instance().get(&DataKey::DonationCount).unwrap_or(0);
        let donation = Donation {
            donor,
            receiver: sign.receiver,
            sign_id,
            amount,
            token,
            message,
            ledger: env.ledger().sequence(),
            timestamp: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Donation(id), &donation);
        env.storage().instance().set(&DataKey::DonationCount, &(id + 1));
        env.events().publish((symbol_short!("donated"), sign_id), (id, amount));
        Ok(id)
    }

    pub fn get_sign(env: Env, sign_id: u32) -> Result<Sign, Error> {
        env.storage().persistent().get(&DataKey::Sign(sign_id)).ok_or(Error::SignNotFound)
    }

    pub fn get_donation(env: Env, donation_id: u32) -> Option<Donation> {
        env.storage().persistent().get(&DataKey::Donation(donation_id))
    }

    pub fn sign_count(env: Env) -> u32 { env.storage().instance().get(&DataKey::SignCount).unwrap_or(0) }
    pub fn donation_count(env: Env) -> u32 { env.storage().instance().get(&DataKey::DonationCount).unwrap_or(0) }
    pub fn token(env: Env) -> Result<Address, Error> { env.storage().instance().get(&DataKey::Token).ok_or(Error::WrongToken) }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn creates_sign_and_rejects_bad_amounts() {
        let env = Env::default();
        let contract = env.register_contract(None, DonateGateway);
        let admin = Address::generate(&env);
        let token = Address::generate(&env);
        let client = DonateGatewayClient::new(&env, &contract);
        env.mock_all_auths();
        client.initialize(&admin, &token);
        let mut amounts = Vec::new(&env); amounts.push_back(10); amounts.push_back(25);
        let receiver = Address::generate(&env);
        let id = client.create_sign(&admin, &receiver, &String::from_str(&env, "Creator"), &amounts);
        assert_eq!(id, 0); assert_eq!(client.sign_count(), 1);
        let bad = Vec::from_array(&env, [0i128]);
        assert_eq!(client.create_sign(&admin, &receiver, &String::from_str(&env, "bad"), &bad), Err(Error::InvalidAmount));
    }

    #[test]
    fn stores_metadata() {
        let env = Env::default();
        let contract = env.register_contract(None, DonateGateway);
        let admin = Address::generate(&env); let token = Address::generate(&env); let receiver = Address::generate(&env);
        let client = DonateGatewayClient::new(&env, &contract); env.mock_all_auths(); client.initialize(&admin, &token);
        let amounts = Vec::from_array(&env, [100i128]);
        client.create_sign(&admin, &receiver, &String::from_str(&env, "Hello"), &amounts);
        assert_eq!(client.get_sign(&0).receiver, receiver);
    }
}
